// backend/src/services/audit.service.js
import { pool } from '../db/pool.js';
import { logger } from '../config/logger.js';

export const auditService = {
  /**
   * Log an audit event
   * @param {object} param0
   * @param {string} param0.eventType e.g. 'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_LOGIN_FAILED'
   * @param {number|null} param0.userId
   * @param {string|null} param0.username
   * @param {string} param0.status 'SUCCESS' | 'FAILURE' | 'WARNING'
   * @param {object|null} param0.details
   * @param {object|null} req Express request to extract IP and user-agent
   */
  async log({ eventType, userId = null, username = null, status = 'SUCCESS', details = null, req = null }) {
    try {
      const ipAddress = req
        ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || null)
        : null;
      const userAgent = req ? (req.headers['user-agent'] || null) : null;
      const detailsJson = details ? JSON.stringify(details) : null;

      const sql = `
        INSERT INTO audit_log (event_type, user_id, username, ip_address, user_agent, status, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [eventType, userId, username, ipAddress, userAgent, status, detailsJson];

      await pool.execute(sql, params);
    } catch (err) {
      logger.error({ err, eventType, username }, 'Failed to write to audit_log');
    }
  },

  async logLoginSuccess(user, req) {
    return this.log({
      eventType: 'AUTH_LOGIN',
      userId: user.id,
      username: user.username,
      status: 'SUCCESS',
      details: { email: user.email, roles: user.roles },
      req
    });
  },

  async logLoginFailure(username, req, reason) {
    return this.log({
      eventType: 'AUTH_LOGIN_FAILED',
      userId: null,
      username,
      status: 'FAILURE',
      details: { reason },
      req
    });
  },

  async logLogout(user, req) {
    return this.log({
      eventType: 'AUTH_LOGOUT',
      userId: user?.id || null,
      username: user?.username || null,
      status: 'SUCCESS',
      details: null,
      req
    });
  },

  async getLogs({ limit = 50, offset = 0, eventType = null, userId = null } = {}) {
    let sql = `
      SELECT id, event_type, user_id, username, ip_address, user_agent, status, details, created_at
      FROM audit_log
      WHERE 1=1
    `;
    const params = [];

    if (eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const [rows] = await pool.query(sql, params);
    return rows;
  }
};
