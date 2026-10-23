// backend/src/services/violation.service.js
import { pool } from '../db/pool.js';
import { policyService } from './policy.service.js';
import { logger } from '../config/logger.js';

class ViolationService {
  constructor() {
    this.listeners = [];
  }

  /**
   * Register listener for detected policy violations
   */
  onViolation(listener) {
    this.listeners.push(listener);
  }

  emitViolation(violation) {
    for (const listener of this.listeners) {
      try {
        listener(violation);
      } catch (err) {
        logger.error({ err, violationId: violation.id }, 'Error in violation listener');
      }
    }
  }

  /**
   * Determine whether a rule violation is blocked pre-execution by MySQL GRANTs
   * or detected post-hoc via general_log audit telemetry.
   */
  classifyEnforcementType(rule, event) {
    // Structural MySQL grant denials
    if (['OPERATION_NOT_GRANTED', 'TABLE_OUT_OF_SCOPE', 'UNAUTHORIZED_DDL'].includes(rule)) {
      return 'blocked_by_db';
    }

    // Semantic, behavioural, or contextual violations that MySQL grants do not restrict
    if (['UNBOUNDED_BULK_READ', 'CROSS_SCHEMA_ACCESS'].includes(rule)) {
      return 'detected_post_hoc';
    }

    if (rule === 'SESSION_EXPIRED') {
      return event.status === 'failed' ? 'blocked_by_db' : 'detected_post_hoc';
    }

    // Default to detected_post_hoc
    return 'detected_post_hoc';
  }

  /**
   * Evaluate an ingested SQL event against OPA Rego policies
   * @param {object} event The sql_events row
   * @param {object|null} session The db_sessions row if attributed
   * @returns {Promise<Array>} List of inserted violations
   */
  async evaluateEvent(event, session) {
    if (!event || !event.id) return [];

    const violationsToInsert = [];

    // Case 1: Attributed JIT Session
    if (session) {
      const grantedOps = Array.isArray(session.granted_operations)
        ? session.granted_operations
        : JSON.parse(session.granted_operations || '[]');

      const grantedRes = Array.isArray(session.granted_resources)
        ? session.granted_resources
        : JSON.parse(session.granted_resources || '[]');

      const isExpired = session.status === 'expired' ||
        session.status === 'revoked' ||
        (new Date(session.end_time) <= new Date(event.event_time));

      const flags = typeof event.flags === 'string'
        ? JSON.parse(event.flags)
        : (event.flags || {});

      const tables = typeof event.tables === 'string'
        ? JSON.parse(event.tables)
        : (event.tables || []);

      const opaInput = {
        session: {
          granted_operations: grantedOps,
          granted_resources: grantedRes,
          is_expired: isExpired,
          mysql_username: session.mysql_username
        },
        query: {
          operation: event.operation,
          tables: tables,
          has_where: Boolean(flags.has_where),
          select_star: Boolean(flags.select_star),
          has_limit: Boolean(flags.has_limit),
          is_ddl: Boolean(flags.is_ddl),
          is_cross_schema: Boolean(flags.is_cross_schema)
        }
      };

      try {
        const opaResult = await policyService.evaluateSqlQuery(opaInput.session, opaInput.query);

        if (!opaResult.allow && Array.isArray(opaResult.violation_details)) {
          for (const detail of opaResult.violation_details) {
            const enforcementType = this.classifyEnforcementType(detail.rule, event);

            violationsToInsert.push({
              eventId: event.id,
              sessionId: session.id,
              userId: session.user_id,
              rule: detail.rule,
              severity: detail.severity || 'medium',
              reason: detail.reason || 'Policy violation detected',
              enforcementType
            });
          }
        }
      } catch (err) {
        logger.error({ err: err.message, eventId: event.id }, 'Error evaluating SQL query against OPA');
      }
    } else {
      // Case 2: Unattributed / Direct queries bypassing JIT
      // If direct query performs DDL or touches target_db.salaries, flag detected_post_hoc
      const tables = typeof event.tables === 'string'
        ? JSON.parse(event.tables)
        : (event.tables || []);
      const flags = typeof event.flags === 'string'
        ? JSON.parse(event.flags)
        : (event.flags || {});

      if (flags.is_ddl) {
        violationsToInsert.push({
          eventId: event.id,
          sessionId: null,
          userId: null,
          rule: 'UNAUTHORIZED_DDL',
          severity: 'critical',
          reason: `DDL operation (${event.operation}) executed without an active JIT session grant`,
          enforcementType: 'detected_post_hoc'
        });
      }

      if (tables.some(t => t.includes('salaries'))) {
        violationsToInsert.push({
          eventId: event.id,
          sessionId: null,
          userId: null,
          rule: 'TABLE_OUT_OF_SCOPE',
          severity: 'high',
          reason: 'Access to sensitive salaries table executed without an active JIT session grant',
          enforcementType: 'detected_post_hoc'
        });
      }
    }

    // Persist violations to itds_app.policy_violations
    const savedViolations = [];
    for (const v of violationsToInsert) {
      try {
        const [res] = await pool.execute(
          `INSERT IGNORE INTO policy_violations (event_id, session_id, user_id, rule, severity, reason, enforcement_type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [v.eventId, v.sessionId, v.userId, v.rule, v.severity, v.reason, v.enforcementType]
        );

        if (!res.insertId) {
          // Already recorded for this event and rule
          continue;
        }

        const savedViolation = {
          id: res.insertId,
          event_id: v.eventId,
          session_id: v.sessionId,
          user_id: v.userId,
          rule: v.rule,
          severity: v.severity,
          reason: v.reason,
          enforcement_type: v.enforcementType,
          created_at: new Date()
        };

        savedViolations.push(savedViolation);
        this.emitViolation(savedViolation);

        logger.warn(
          {
            violationId: res.insertId,
            rule: v.rule,
            severity: v.severity,
            enforcement: v.enforcementType,
            eventId: v.eventId
          },
          'Policy violation recorded'
        );
      } catch (insertErr) {
        logger.error({ err: insertErr, violation: v }, 'Failed to insert policy violation');
      }
    }

    return savedViolations;
  }

  /**
   * List and filter policy violations
   */
  async listViolations({
    sessionId,
    userId,
    rule,
    severity,
    enforcementType,
    limit = 100,
    offset = 0
  } = {}) {
    let sql = `
      SELECT pv.id, pv.event_id, pv.session_id, pv.user_id, pv.rule, pv.severity,
             pv.reason, pv.enforcement_type, pv.created_at,
             se.raw_sql, se.operation, se.tables, se.mysql_username, se.event_time,
             u.username, u.full_name
      FROM policy_violations pv
      INNER JOIN sql_events se ON pv.event_id = se.id
      LEFT JOIN users u ON pv.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (sessionId) {
      sql += ' AND pv.session_id = ?';
      params.push(sessionId);
    }
    if (userId) {
      sql += ' AND pv.user_id = ?';
      params.push(userId);
    }
    if (rule) {
      sql += ' AND pv.rule = ?';
      params.push(rule);
    }
    if (severity) {
      sql += ' AND pv.severity = ?';
      params.push(severity);
    }
    if (enforcementType) {
      sql += ' AND pv.enforcement_type = ?';
      params.push(enforcementType);
    }

    sql += ' ORDER BY pv.id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const [rows] = await pool.query(sql, params);

    return rows.map(r => ({
      ...r,
      tables: typeof r.tables === 'string' ? JSON.parse(r.tables) : r.tables
    }));
  }
}

export const violationService = new ViolationService();
