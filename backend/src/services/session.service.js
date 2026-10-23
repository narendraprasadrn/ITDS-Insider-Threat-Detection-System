// backend/src/services/session.service.js
import crypto from 'crypto';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { auditService } from './audit.service.js';
import { profileService } from './profile.service.js';
import { AppError } from '../middleware/errorHandler.js';

export const sessionService = {
  /**
   * Generate secure alphanumeric password (no problematic quote or slash characters)
   */
  generatePassword(length = 18) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#%^&*';
    let pass = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      pass += chars[bytes[i] % chars.length];
    }
    return `Jit${pass.replace(/['"\\/`]/g, 'X')}9!`;
  },

  /**
   * Provision a temporary least-privilege MySQL user for an approved session
   */
  async provisionSession({ requestId, userId, profile, durationMinutes }) {
    const randSuffix = crypto.randomBytes(3).toString('hex');
    const mysqlUsername = `jit_${requestId}_${randSuffix}`;
    const mysqlPassword = this.generatePassword(16);

    logger.info({ mysqlUsername, profile: profile.name }, 'Provisioning JIT MySQL user');

    // 1. Create MySQL user on host '%' and 'localhost'
    await pool.query(`CREATE USER '${mysqlUsername}'@'%' IDENTIFIED BY '${mysqlPassword}'`);
    await pool.query(`CREATE USER '${mysqlUsername}'@'localhost' IDENTIFIED BY '${mysqlPassword}'`);

    // 2. Grant least-privilege permissions based strictly on profile
    const allowedOps = profile.allowed_operations || ['SELECT'];
    const ddlGranted = allowedOps.includes('DDL');
    const tableOps = allowedOps.filter(op => ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(op));

    // Table-level grants for each resource in profile
    for (const res of profile.resources) {
      if (tableOps.length > 0) {
        const grantsList = tableOps.join(', ');
        await pool.query(`GRANT ${grantsList} ON \`${res.db_name}\`.\`${res.table_name}\` TO '${mysqlUsername}'@'%'`);
        await pool.query(`GRANT ${grantsList} ON \`${res.db_name}\`.\`${res.table_name}\` TO '${mysqlUsername}'@'localhost'`);
      }
    }

    // DDL privileges if explicitly approved
    if (ddlGranted) {
      await pool.query(`GRANT CREATE, ALTER, DROP ON \`${env.DB.TARGET_NAME}\`.* TO '${mysqlUsername}'@'%'`);
      await pool.query(`GRANT CREATE, ALTER, DROP ON \`${env.DB.TARGET_NAME}\`.* TO '${mysqlUsername}'@'localhost'`);
    }

    await pool.query('FLUSH PRIVILEGES');

    // 3. Store active session record in db_sessions
    const endTime = new Date(Date.now() + durationMinutes * 60 * 1000);
    const grantedResources = profile.resources.map(r => `${r.db_name}.${r.table_name}`);

    const [sessionResult] = await pool.execute(
      `INSERT INTO db_sessions (request_id, user_id, profile_id, status, end_time, mysql_username, mysql_password, granted_operations, granted_resources)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      [
        requestId,
        userId,
        profile.id,
        endTime,
        mysqlUsername,
        mysqlPassword,
        JSON.stringify(allowedOps),
        JSON.stringify(grantedResources)
      ]
    );

    const sessionId = sessionResult.insertId;

    logger.info({ sessionId, mysqlUsername, expiresAt: endTime.toISOString() }, 'JIT MySQL session provisioned');

    return {
      sessionId,
      credentials: {
        host: env.DB.HOST,
        port: env.DB.PORT,
        database: env.DB.TARGET_NAME,
        username: mysqlUsername,
        password: mysqlPassword,
        expiresAt: endTime.toISOString(),
        durationMinutes
      }
    };
  },

  /**
   * Explicit Administrative Database Access Mechanism
   * Bypasses the employee approval queue under administrative authorization policy.
   * Directly provisions a least-privilege, time-bounded MySQL user for administrators.
   */
  async provisionAdminSession({ adminUser, profileId = 7, durationMinutes = 60 }) {
    if (!adminUser.roles.includes('admin')) {
      throw new AppError('Administrative provisioning is strictly restricted to administrators', 403, 'FORBIDDEN');
    }

    const targetProfileId = profileId ? Number(profileId) : 7;
    const profile = await profileService.getProfile(targetProfileId);

    // If an elevated or sensitive administrative operation requires independent approval, enforce second-person approval
    if (profile.requires_approval) {
      throw new AppError(
        `Profile '${profile.name}' is an elevated/sensitive profile requiring independent second-person approval. It cannot be directly provisioned.`,
        400,
        'INDEPENDENT_APPROVAL_REQUIRED'
      );
    }

    const maxAllowed = profile.max_duration_minutes || 60;
    const duration = Math.min(Math.max(Number(durationMinutes) || maxAllowed, 15), maxAllowed);

    const requestedOpsJson = JSON.stringify(profile.allowed_operations || ['SELECT']);
    const requestedResJson = JSON.stringify(profile.resources.map(r => `${r.db_name}.${r.table_name}`));

    // Atomically create an approved access_requests record for lifecycle traceability and DB integrity
    const [reqResult] = await pool.execute(
      `INSERT INTO access_requests (
         user_id, profile_id, requested_duration_minutes, justification,
         status, decision_action, decision_reasons,
         requested_operations, requested_resources,
         approved_by, approved_at, activated_at
       ) VALUES (?, ?, ?, ?, 'active', 'allow', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        adminUser.id,
        profile.id,
        duration,
        `Direct administrative database access authorized under ITDS administrative policy for ${adminUser.username}`,
        JSON.stringify(['Administrative authorization policy bypasses employee approval queue']),
        requestedOpsJson,
        requestedResJson,
        adminUser.id
      ]
    );

    const requestId = reqResult.insertId;

    // Provision ephemeral MySQL credentials
    const sessionResult = await this.provisionSession({
      requestId,
      userId: adminUser.id,
      profile,
      durationMinutes: duration
    });

    const endTime = new Date(Date.now() + duration * 60 * 1000);

    // Update access_requests with session_id and expires_at
    await pool.execute(
      `UPDATE access_requests SET session_id = ?, expires_at = ? WHERE id = ?`,
      [sessionResult.sessionId, endTime, requestId]
    );

    // Audit log
    await auditService.log({
      eventType: 'ADMIN_SESSION_PROVISIONED',
      userId: adminUser.id,
      username: adminUser.username,
      status: 'SUCCESS',
      details: {
        sessionId: sessionResult.sessionId,
        requestId,
        profileName: profile.name,
        durationMinutes: duration,
        mysqlUsername: sessionResult.credentials.username
      }
    });

    return {
      success: true,
      status: 'active',
      sessionId: sessionResult.sessionId,
      requestId,
      credentials: sessionResult.credentials
    };
  },

  /**
   * Terminate active connections and DROP the temporary MySQL user
   */
  async dropMysqlUser(mysqlUsername) {
    try {
      const [threads] = await pool.query(
        `SELECT ID FROM information_schema.processlist WHERE USER = ?`,
        [mysqlUsername]
      );

      for (const t of threads) {
        try {
          await pool.query(`KILL ${t.ID}`);
          logger.info({ threadId: t.ID, mysqlUsername }, 'Killed active JIT connection thread');
        } catch (err) {
          logger.warn({ err: err.message, threadId: t.ID }, 'Failed to kill thread, might already be closed');
        }
      }

      await pool.query(`DROP USER IF EXISTS '${mysqlUsername}'@'%'`);
      await pool.query(`DROP USER IF EXISTS '${mysqlUsername}'@'localhost'`);
      await pool.query('FLUSH PRIVILEGES');
      logger.info({ mysqlUsername }, 'Dropped ephemeral MySQL user');
    } catch (err) {
      logger.error({ err, mysqlUsername }, 'Error dropping MySQL user');
    }
  },

  /**
   * Background Expiry Worker: drop expired users, mark session and request as 'expired'
   */
  async processExpiredSessions() {
    try {
      const [expired] = await pool.query(
        `SELECT id, request_id, mysql_username, user_id FROM db_sessions
         WHERE status = 'active' AND end_time <= NOW()`
      );

      if (expired.length === 0) return 0;

      logger.info({ count: expired.length }, 'Processing expired JIT sessions');

      for (const s of expired) {
        await this.dropMysqlUser(s.mysql_username);
        await pool.execute(`UPDATE db_sessions SET status = 'expired', mysql_password = NULL WHERE id = ?`, [s.id]);

        // Synchronize access_requests lifecycle
        await pool.execute(
          `UPDATE access_requests SET status = 'expired' WHERE id = ? OR session_id = ?`,
          [s.request_id, s.id]
        );

        await auditService.log({
          eventType: 'SESSION_EXPIRED',
          userId: s.user_id,
          username: s.mysql_username,
          status: 'SUCCESS',
          details: { sessionId: s.id, requestId: s.request_id }
        });
      }

      return expired.length;
    } catch (err) {
      logger.error({ err }, 'Error in processExpiredSessions worker');
      return 0;
    }
  },

  /**
   * Manual force-revoke session by administrator or DBA
   */
  async revokeSession(sessionId, decidingUser) {
    const [rows] = await pool.execute(
      `SELECT id, request_id, mysql_username, user_id, status FROM db_sessions WHERE id = ? LIMIT 1`,
      [sessionId]
    );

    if (rows.length === 0) {
      throw new AppError('Session not found', 404, 'NOT_FOUND');
    }

    const session = rows[0];
    if (session.status !== 'active') {
      throw new AppError(`Session is already ${session.status}`, 400, 'BAD_REQUEST');
    }

    // Drop user and kill connections
    await this.dropMysqlUser(session.mysql_username);

    // Update session status to revoked and clear credentials
    await pool.execute(`UPDATE db_sessions SET status = 'revoked', mysql_password = NULL WHERE id = ?`, [sessionId]);

    // Synchronize access_requests lifecycle
    await pool.execute(
      `UPDATE access_requests
       SET status = 'revoked',
           revoked_at = CURRENT_TIMESTAMP,
           revoked_by = ?
       WHERE id = ? OR session_id = ?`,
      [decidingUser?.id || null, session.request_id, sessionId]
    );

    await auditService.log({
      eventType: 'SESSION_REVOKED',
      userId: session.user_id,
      username: session.mysql_username,
      status: 'WARNING',
      details: {
        sessionId,
        requestId: session.request_id,
        revokedBy: decidingUser?.username || 'admin'
      }
    });

    return { success: true, message: `Session ${sessionId} successfully revoked` };
  },

  /**
   * Unified listSessions endpoint supporting filtering and role scoping
   */
  async listSessions({ user, status, limit = 50, offset = 0 } = {}) {
    const isElevated = user.roles.some(r => r === 'admin' || r === 'dba');

    let sql = `
      SELECT s.id, s.request_id, s.user_id, s.profile_id, s.status, s.start_time, s.end_time,
             s.mysql_username, s.granted_operations, s.granted_resources, s.created_at,
             u.username, u.full_name, u.email,
             p.name AS profile_name, p.risk_level
      FROM db_sessions s
      JOIN users u ON s.user_id = u.id
      JOIN access_profiles p ON s.profile_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (!isElevated) {
      sql += ' AND s.user_id = ?';
      params.push(user.id);
    }

    if (status && status !== 'all') {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY s.id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const [rows] = await pool.query(sql, params);

    return rows.map(r => ({
      ...r,
      granted_operations: typeof r.granted_operations === 'string' ? JSON.parse(r.granted_operations) : (r.granted_operations || []),
      granted_resources: typeof r.granted_resources === 'string' ? JSON.parse(r.granted_resources) : (r.granted_resources || [])
    }));
  },

  /**
   * Get single session details by ID
   */
  async getSessionById(sessionId, user) {
    const isElevated = user.roles.some(r => r === 'admin' || r === 'dba');

    const [rows] = await pool.execute(
      `SELECT s.id, s.request_id, s.user_id, s.profile_id, s.status, s.start_time, s.end_time,
              s.mysql_username, s.granted_operations, s.granted_resources, s.created_at,
              u.username, u.full_name, u.email,
              p.name AS profile_name, p.risk_level
       FROM db_sessions s
       JOIN users u ON s.user_id = u.id
       JOIN access_profiles p ON s.profile_id = p.id
       WHERE s.id = ? LIMIT 1`,
      [sessionId]
    );

    if (rows.length === 0) {
      throw new AppError('Session not found', 404, 'NOT_FOUND');
    }

    const session = rows[0];
    if (!isElevated && session.user_id !== user.id) {
      throw new AppError('Unauthorized access to session details', 403, 'FORBIDDEN');
    }

    return {
      ...session,
      granted_operations: typeof session.granted_operations === 'string' ? JSON.parse(session.granted_operations) : (session.granted_operations || []),
      granted_resources: typeof session.granted_resources === 'string' ? JSON.parse(session.granted_resources) : (session.granted_resources || [])
    };
  },

  /**
   * Get active sessions with user details (for dashboard & legacy consumers)
   */
  async getActiveSessions() {
    const [rows] = await pool.query(
      `SELECT s.id, s.request_id, s.user_id, s.profile_id, s.status, s.start_time, s.end_time,
              s.mysql_username, s.granted_operations, s.granted_resources, s.created_at,
              u.username, u.full_name, u.email,
              p.name AS profile_name, p.risk_level
       FROM db_sessions s
       JOIN users u ON s.user_id = u.id
       JOIN access_profiles p ON s.profile_id = p.id
       WHERE s.status = 'active'
       ORDER BY s.end_time ASC`
    );

    return rows.map(r => ({
      ...r,
      granted_operations: typeof r.granted_operations === 'string' ? JSON.parse(r.granted_operations) : r.granted_operations,
      granted_resources: typeof r.granted_resources === 'string' ? JSON.parse(r.granted_resources) : r.granted_resources
    }));
  },

  /**
   * Get user's own sessions
   */
  async getUserSessions(userId) {
    const [rows] = await pool.execute(
      `SELECT s.id, s.request_id, s.user_id, s.profile_id, s.status, s.start_time, s.end_time,
              s.mysql_username, s.granted_operations, s.granted_resources,
              p.name AS profile_name, p.risk_level,
              (SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = s.user_id LIMIT 1) AS user_role
       FROM db_sessions s
       JOIN access_profiles p ON s.profile_id = p.id
       WHERE s.user_id = ?
       ORDER BY s.id DESC LIMIT 50`,
      [userId]
    );

    return rows.map(r => ({
      ...r,
      granted_operations: typeof r.granted_operations === 'string' ? JSON.parse(r.granted_operations) : r.granted_operations,
      granted_resources: typeof r.granted_resources === 'string' ? JSON.parse(r.granted_resources) : r.granted_resources
    }));
  }
};
