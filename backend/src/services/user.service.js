// backend/src/services/user.service.js
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';

export const userService = {
  /**
   * List all users with their roles
   */
  async listUsers() {
    const [users] = await pool.query(
      `SELECT id, username, email, full_name, is_active, created_at, updated_at
       FROM users ORDER BY id ASC`
    );

    const [userRoles] = await pool.query(
      `SELECT ur.user_id, r.name AS role_name
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id`
    );

    const rolesMap = {};
    for (const ur of userRoles) {
      if (!rolesMap[ur.user_id]) rolesMap[ur.user_id] = [];
      rolesMap[ur.user_id].push(ur.role_name);
    }

    return users.map(u => ({
      ...u,
      roles: rolesMap[u.id] || []
    }));
  },

  /**
   * Get single user by ID
   */
  async getUser(id) {
    const [users] = await pool.execute(
      `SELECT id, username, email, full_name, is_active, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
      [id]
    );

    if (users.length === 0) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    const [roles] = await pool.execute(
      `SELECT r.id, r.name, r.description
       FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [id]
    );

    return {
      ...users[0],
      roles: roles.map(r => r.name)
    };
  },

  /**
   * Create new user and assign roles
   */
  async createUser({ username, email, password, full_name, roles = [] }) {
    if (!username || !email || !password || !full_name) {
      throw new AppError('Username, email, password, and full name are required', 400, 'BAD_REQUEST');
    }

    // Check duplicate username or email
    const [existing] = await pool.execute(
      `SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1`,
      [username, email]
    );
    if (existing.length > 0) {
      throw new AppError('Username or email already exists', 409, 'CONFLICT');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      `INSERT INTO users (username, email, password_hash, full_name, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [username, email, passwordHash, full_name]
    );

    const userId = result.insertId;

    // Assign roles
    if (roles && roles.length > 0) {
      for (const roleName of roles) {
        const [r] = await pool.execute(`SELECT id FROM roles WHERE name = ? LIMIT 1`, [roleName]);
        if (r.length > 0) {
          await pool.execute(
            `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
            [userId, r[0].id]
          );
        }
      }
    }

    return await this.getUser(userId);
  },

  /**
   * Update existing user
   */
  async updateUser(id, { full_name, email, is_active, roles, password }) {
    await this.getUser(id); // Ensure exists

    const updates = [];
    const params = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      params.push(full_name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active);
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }

    if (updates.length > 0) {
      params.push(id);
      await pool.execute(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    if (roles && Array.isArray(roles)) {
      // Clear existing and re-assign
      await pool.execute(`DELETE FROM user_roles WHERE user_id = ?`, [id]);
      for (const roleName of roles) {
        const [r] = await pool.execute(`SELECT id FROM roles WHERE name = ? LIMIT 1`, [roleName]);
        if (r.length > 0) {
          await pool.execute(
            `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
            [id, r[0].id]
          );
        }
      }
    }

    return await this.getUser(id);
  },

  /**
   * Soft delete / deactivate user
   */
  async deleteUser(id) {
    await this.getUser(id);
    await pool.execute(`UPDATE users SET is_active = FALSE WHERE id = ?`, [id]);
    return { success: true, message: `User ${id} deactivated successfully` };
  }
};
