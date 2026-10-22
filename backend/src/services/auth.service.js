// backend/src/services/auth.service.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { auditService } from './audit.service.js';
import { AppError } from '../middleware/errorHandler.js';

export const authService = {
  /**
   * Get user by username or email along with roles and permissions
   */
  async getUserByUsername(username) {
    const [users] = await pool.execute(
      `SELECT id, username, email, password_hash, full_name, is_active, created_at, updated_at
       FROM users WHERE username = ? OR email = ? LIMIT 1`,
      [username, username]
    );

    if (users.length === 0) return null;
    const user = users[0];

    // Fetch roles
    const [roles] = await pool.execute(
      `SELECT r.id, r.name, r.description
       FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.id]
    );

    // Fetch permissions
    const [permissions] = await pool.execute(
      `SELECT DISTINCT p.name
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       JOIN user_roles ur ON rp.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.id]
    );

    return {
      ...user,
      roles: roles.map(r => r.name),
      permissions: permissions.map(p => p.name)
    };
  },

  /**
   * Get user by ID with roles and permissions
   */
  async getUserById(userId) {
    const [users] = await pool.execute(
      `SELECT id, username, email, full_name, is_active, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (users.length === 0) return null;
    const user = users[0];

    const [roles] = await pool.execute(
      `SELECT r.id, r.name, r.description
       FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.id]
    );

    const [permissions] = await pool.execute(
      `SELECT DISTINCT p.name
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       JOIN user_roles ur ON rp.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.id]
    );

    return {
      ...user,
      roles: roles.map(r => r.name),
      permissions: permissions.map(p => p.name)
    };
  },

  /**
   * Authenticate user with password and generate tokens
   */
  async login(username, password, req = null) {
    if (!username || !password) {
      await auditService.logLoginFailure(username || 'anonymous', req, 'Missing credentials');
      throw new AppError('Username and password are required', 400, 'BAD_REQUEST');
    }

    const user = await this.getUserByUsername(username);
    if (!user) {
      await auditService.logLoginFailure(username, req, 'User not found');
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.is_active) {
      await auditService.logLoginFailure(username, req, 'Account is disabled');
      throw new AppError('Your account has been deactivated. Please contact an administrator.', 403, 'ACCOUNT_DISABLED');
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await auditService.logLoginFailure(username, req, 'Invalid password');
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // Audit log successful login
    await auditService.logLoginSuccess(user, req);

    const { password_hash, ...safeUser } = user;
    return {
      user: safeUser,
      accessToken,
      refreshToken
    };
  },

  /**
   * Generate access and refresh tokens
   */
  async generateTokens(user) {
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions
    };

    const accessToken = jwt.sign(payload, env.JWT.SECRET, {
      expiresIn: env.JWT.EXPIRES_IN
    });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    // Calculate expiration (7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Save refresh token in database
    await pool.execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
      [user.id, tokenHash, expiresAt]
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken
    };
  },

  /**
   * Refresh access token
   */
  async refreshAccessToken(rawRefreshToken) {
    if (!rawRefreshToken) {
      throw new AppError('Refresh token is required', 400, 'BAD_REQUEST');
    }

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const [rows] = await pool.execute(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');
    }

    const tokenRecord = rows[0];
    if (tokenRecord.revoked_at || new Date(tokenRecord.expires_at) < new Date()) {
      throw new AppError('Expired or revoked refresh token', 401, 'EXPIRED_TOKEN');
    }

    // Revoke old refresh token (rotation)
    await pool.execute(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?`, [tokenRecord.id]);

    const user = await this.getUserById(tokenRecord.user_id);
    if (!user || !user.is_active) {
      throw new AppError('User not found or inactive', 401, 'USER_INACTIVE');
    }

    return await this.generateTokens(user);
  },

  /**
   * Logout user and revoke tokens
   */
  async logout(user, rawRefreshToken = null, req = null) {
    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await pool.execute(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?`, [tokenHash]);
    }
    await auditService.logLogout(user, req);
    return true;
  }
};
