// backend/src/services/ingestor.service.js
import { pool } from '../db/pool.js';
import { sqlParserService } from './sqlParser.service.js';
import { violationService } from './violation.service.js';
import { riskEngineService } from './riskEngine.service.js';
import { logger } from '../config/logger.js';

class IngestorService {
  constructor() {
    this.listeners = [];
    this.isPolling = false;
  }

  /**
   * Register listener for newly ingested SQL events
   */
  onEvent(listener) {
    this.listeners.push(listener);
  }

  emitEvent(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error({ err, eventId: event.id }, 'Error in SQL event listener');
      }
    }
  }

  /**
   * Extract username from mysql.general_log user_host string
   * e.g. "jit_1_9a8b[jit_1_9a8b] @ localhost [::1]" -> "jit_1_9a8b"
   */
  extractUsername(userHost) {
    if (!userHost) return 'unknown';
    const match = userHost.match(/^([a-zA-Z0-9_]+)\[/);
    if (match) return match[1];

    // Fallback: split on '[' or ' '
    const firstPart = userHost.split(/[[@\s]/)[0];
    return firstPart || 'unknown';
  }

  /**
   * Single ingestion polling cycle
   */
  async poll() {
    if (this.isPolling) return 0;
    this.isPolling = true;

    try {
      // 1. Get high-water mark with microsecond precision string
      const [wmRows] = await pool.query(
        "SELECT DATE_FORMAT(last_event_time, '%Y-%m-%d %H:%i:%s.%f') AS last_time_str, last_thread_id FROM `ingest_watermark` WHERE id = 1 LIMIT 1"
      );

      const lastTimeStr = wmRows[0]?.last_time_str || new Date(Date.now() - 60000).toISOString().replace('T', ' ').replace('Z', '');
      const lastThread = wmRows[0]?.last_thread_id || 0;

      // 2. Query general_log for new queries strictly after high-water mark
      const [logRows] = await pool.query(
        `SELECT DATE_FORMAT(event_time, '%Y-%m-%d %H:%i:%s.%f') AS event_time_str,
                event_time, user_host, thread_id, command_type, argument
         FROM mysql.general_log
         WHERE command_type = 'Query'
           AND (event_time > ? OR (event_time = ? AND thread_id > ?))
         ORDER BY event_time ASC, thread_id ASC
         LIMIT 250`,
        [lastTimeStr, lastTimeStr, lastThread]
      );

      if (logRows.length === 0) {
        this.isPolling = false;
        return 0;
      }

      let newEventsCount = 0;
      let maxEventTimeStr = lastTimeStr;
      let maxThreadId = lastThread;

      for (const log of logRows) {
        maxEventTimeStr = log.event_time_str;
        maxThreadId = log.thread_id;

        const rawSql = typeof log.argument === 'string'
          ? log.argument
          : (log.argument ? log.argument.toString('utf8') : '');

        if (!rawSql) continue;

        const username = this.extractUsername(log.user_host);

        // Filter out backend's own administrative or metadata queries
        if (
          username === 'itds_admin' ||
          rawSql.includes('mysql.general_log') ||
          rawSql.includes('ingest_watermark') ||
          rawSql.includes('SELECT @@') ||
          rawSql.startsWith('SHOW ') ||
          rawSql.startsWith('SET ')
        ) {
          continue;
        }

        // 3. Attribution: Map jit_* users to db_sessions
        let sessionId = null;
        let userId = null;
        let sessionRow = null;
        let attributionStatus = 'unattributed';

        if (username.startsWith('jit_')) {
          const [sessRows] = await pool.execute(
            `SELECT id, user_id, status, end_time, mysql_username, granted_operations, granted_resources
             FROM db_sessions WHERE mysql_username = ? LIMIT 1`,
            [username]
          );
          if (sessRows.length > 0) {
            sessionRow = sessRows[0];
            sessionId = sessionRow.id;
            userId = sessionRow.user_id;
            attributionStatus = 'attributed';
          }
        }

        const sourceLogId = `${log.event_time_str}:${log.thread_id}`;

        // 4. Check if event was ALREADY executed and recorded by SQL workspace
        if (sessionId && log.thread_id) {
          const [matched] = await pool.query(
            `SELECT id, source_log_id FROM sql_events 
             WHERE session_id = ? AND thread_id = ? AND (source_log_id LIKE 'workspace:%' OR source_log_id = ?)
             LIMIT 1`,
            [sessionId, log.thread_id, sourceLogId]
          );
          if (matched.length > 0) {
            // Workspace already inserted and evaluated this event
            if (matched[0].source_log_id !== sourceLogId) {
              await pool.execute(
                `UPDATE sql_events SET source_log_id = ? WHERE id = ?`,
                [sourceLogId, matched[0].id]
              );
            }
            continue;
          }
        }

        // 5. Parse SQL
        const parsed = sqlParserService.parse(rawSql);
        const finalStatus = parsed.parse_error ? 'parse_error' : attributionStatus;

        // 6. Insert into sql_events (INSERT IGNORE using uq_source_log_id)
        const [insertRes] = await pool.execute(
          `INSERT IGNORE INTO sql_events (session_id, user_id, mysql_username, thread_id, event_time, raw_sql, normalized_sql, operation, tables, flags, source_log_id, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            userId,
            username,
            log.thread_id,
            log.event_time_str,
            rawSql,
            parsed.normalized_sql,
            parsed.operation,
            JSON.stringify(parsed.tables),
            JSON.stringify(parsed.flags),
            sourceLogId,
            finalStatus
          ]
        );

        if (!insertRes.insertId) {
          // Already ingested / duplicate
          continue;
        }

        const eventId = insertRes.insertId;
        newEventsCount++;

        const eventPayload = {
          id: eventId,
          session_id: sessionId,
          user_id: userId,
          mysql_username: username,
          thread_id: log.thread_id,
          event_time: log.event_time,
          raw_sql: rawSql,
          normalized_sql: parsed.normalized_sql,
          operation: parsed.operation,
          tables: parsed.tables,
          flags: parsed.flags,
          status: finalStatus
        };

        // 7. Real-time Policy Evaluation: Detect violations and persist to policy_violations
        try {
          await violationService.evaluateEvent(eventPayload, sessionRow);
        } catch (evalErr) {
          logger.error({ err: evalErr, eventId }, 'Policy evaluation failed for ingested event');
        }

        // 8. Update Session Risk Score & Evaluate Threat Detectors
        if (sessionId) {
          try {
            await riskEngineService.evaluateSessionRisk(sessionId);
          } catch (riskErr) {
            logger.error({ err: riskErr, sessionId }, 'Risk engine evaluation failed for session');
          }
        }

        // Notify listeners
        this.emitEvent(eventPayload);
      }

      // 9. Update watermark with exact microsecond string
      if (logRows.length > 0 && maxEventTimeStr) {
        await pool.execute(
          `UPDATE ingest_watermark SET last_event_time = ?, last_thread_id = ? WHERE id = 1`,
          [maxEventTimeStr, maxThreadId]
        );
      }

      this.isPolling = false;
      return newEventsCount;
    } catch (err) {
      logger.error({ err }, 'Error during SQL activity log polling');
      this.isPolling = false;
      return 0;
    }
  }

  /**
   * Filter and query sql_events
   */
  async listEvents({ sessionId, userId, operation, status, limit = 100, offset = 0 } = {}) {
    let sql = `
      SELECT se.id, se.session_id, se.user_id, se.mysql_username, se.thread_id, se.event_time,
             se.raw_sql, se.normalized_sql, se.operation, se.tables, se.flags, se.status, se.created_at,
             u.username, u.full_name,
             p.name AS profile_name
      FROM sql_events se
      LEFT JOIN users u ON se.user_id = u.id
      LEFT JOIN db_sessions ds ON se.session_id = ds.id
      LEFT JOIN access_profiles p ON ds.profile_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (sessionId) {
      sql += ' AND se.session_id = ?';
      params.push(sessionId);
    }
    if (userId) {
      sql += ' AND se.user_id = ?';
      params.push(userId);
    }
    if (operation) {
      sql += ' AND se.operation = ?';
      params.push(operation);
    }
    if (status) {
      sql += ' AND se.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY se.event_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const [rows] = await pool.query(sql, params);

    return rows.map(r => ({
      ...r,
      tables: typeof r.tables === 'string' ? JSON.parse(r.tables) : r.tables,
      flags: typeof r.flags === 'string' ? JSON.parse(r.flags) : r.flags
    }));
  }
}

export const ingestorService = new IngestorService();
