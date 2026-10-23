// backend/src/services/workspace.service.js
import mysql from 'mysql2/promise';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { sqlParserService } from './sqlParser.service.js';
import { policyService } from './policy.service.js';
import { violationService } from './violation.service.js';
import { riskEngineService } from './riskEngine.service.js';
import { auditService } from './audit.service.js';
import { AppError } from '../middleware/errorHandler.js';

export const workspaceService = {
  /**
   * Execute SQL query through active JIT session with pre-execution OPA policy enforcement
   */
  async executeQuery({ user, sessionId, sql, req = null }) {
    if (!sessionId || !sql || !sql.trim()) {
      throw new AppError('Session ID and SQL query are required', 400, 'BAD_REQUEST');
    }

    const trimmedSql = sql.trim();

    // 1. Fetch and validate active JIT session
    const [sessRows] = await pool.execute(
      `SELECT s.id, s.request_id, s.user_id, s.profile_id, s.status, s.start_time, s.end_time,
              s.mysql_username, s.granted_operations, s.granted_resources,
              p.name AS profile_name
       FROM db_sessions s
       JOIN access_profiles p ON s.profile_id = p.id
       WHERE s.id = ? LIMIT 1`,
      [sessionId]
    );

    if (sessRows.length === 0) {
      throw new AppError('Session not found', 404, 'NOT_FOUND');
    }

    const session = sessRows[0];
    const isElevated = user.roles.some(r => r === 'admin' || r === 'dba');

    // Strict boundary: user can only execute against their own session unless admin/dba
    if (!isElevated && session.user_id !== user.id) {
      throw new AppError('You are not authorized to execute queries in this session', 403, 'FORBIDDEN_SESSION');
    }

    const isExpired = session.status !== 'active' || new Date(session.end_time) <= new Date();
    if (isExpired) {
      throw new AppError(
        `Session #${sessionId} is ${session.status === 'active' ? 'expired' : session.status}. Query execution is denied.`,
        403,
        'SESSION_INACTIVE'
      );
    }

    const grantedOps = typeof session.granted_operations === 'string'
      ? JSON.parse(session.granted_operations)
      : session.granted_operations;

    const grantedRes = typeof session.granted_resources === 'string'
      ? JSON.parse(session.granted_resources)
      : session.granted_resources;

    // 2. Disallow multi-statement execution to prevent SQL injection chaining
    const semicolonCount = (trimmedSql.match(/;/g) || []).length;
    if (semicolonCount > 1 || (semicolonCount === 1 && !trimmedSql.endsWith(';'))) {
      throw new AppError(
        'Multi-statement SQL queries are not permitted in the workspace for security safety.',
        400,
        'MULTI_STATEMENT_PROHIBITED'
      );
    }

    // 3. Parse SQL via AST parser
    const parsed = sqlParserService.parse(trimmedSql);
    if (parsed.parse_error) {
      // Record parse error attempt
      await pool.execute(
        `INSERT INTO sql_events (session_id, user_id, mysql_username, thread_id, event_time, raw_sql, normalized_sql, operation, tables, flags, source_log_id, status)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, 'parse_error')`,
        [
          session.id,
          user.id,
          session.mysql_username,
          0,
          trimmedSql,
          trimmedSql,
          'UNKNOWN',
          JSON.stringify([]),
          JSON.stringify({ parse_error: true }),
          `ws_parse_err:${Date.now()}`
        ]
      );
      throw new AppError(`SQL Parsing / Syntax Error: ${parsed.parse_error}`, 400, 'SYNTAX_ERROR');
    }

    // 4. Pre-Execution Policy Evaluation (OPA / Session Matrix)
    const policyResult = await policyService.evaluateSqlQuery(
      {
        session_id: session.id,
        user_id: user.id,
        granted_operations: grantedOps,
        granted_resources: grantedRes,
        is_expired: false
      },
      {
        operation: parsed.operation,
        tables: parsed.tables,
        has_where: parsed.flags.has_where,
        select_star: parsed.flags.select_star,
        has_limit: parsed.flags.has_limit,
        is_ddl: parsed.flags.is_ddl,
        is_cross_schema: parsed.flags.is_cross_schema
      }
    );

    // 5. IF POLICY BLOCKS QUERY: Block pre-execution!
    if (!policyResult.allow) {
      logger.warn(
        { sessionId: session.id, user: user.username, violations: policyResult.violations, sql: trimmedSql },
        'SQL query PRE-EMPTIVELY BLOCKED by policy in workspace'
      );

      // Record blocked event in sql_events
      const [blockedEvent] = await pool.execute(
        `INSERT INTO sql_events (
           session_id, user_id, mysql_username, thread_id, event_time,
           raw_sql, normalized_sql, operation, tables, flags,
           policy_decision, source_log_id, status
         ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, 'blocked')`,
        [
          session.id,
          user.id,
          session.mysql_username,
          0,
          trimmedSql,
          parsed.normalized_sql,
          parsed.operation,
          JSON.stringify(parsed.tables),
          JSON.stringify(parsed.flags),
          JSON.stringify(policyResult),
          `workspace_blocked:${Date.now()}`
        ]
      );

      const eventId = blockedEvent.insertId;

      // Persist policy violations
      for (const rule of policyResult.violations) {
        let reason = `Blocked pre-execution: rule '${rule}' violated`;
        if (rule === 'TABLE_OUT_OF_SCOPE') {
          reason = `Query accessed unauthorized table: ${parsed.tables.join(', ')}`;
        } else if (rule === 'OPERATION_NOT_GRANTED') {
          reason = `Operation '${parsed.operation}' is not granted in active profile`;
        } else if (rule === 'CROSS_SCHEMA_ACCESS') {
          reason = `Cross-schema access to unauthorized system catalog`;
        } else if (rule === 'UNAUTHORIZED_DDL') {
          reason = `DDL modification prohibited in profile '${session.profile_name}'`;
        }

        await pool.execute(
          `INSERT INTO policy_violations (event_id, session_id, user_id, rule, severity, reason, enforcement_type)
           VALUES (?, ?, ?, ?, 'high', ?, 'blocked_pre_execution')`,
          [eventId, session.id, user.id, rule, reason]
        );
      }

      // Update session risk assessment
      await riskEngineService.evaluateSessionRisk(session.id);

      // Audit log the blocked attempt
      await auditService.log({
        eventType: 'SQL_BLOCKED_BY_POLICY',
        userId: user.id,
        username: user.username,
        status: 'WARNING',
        details: {
          sessionId: session.id,
          sql: trimmedSql,
          violations: policyResult.violations
        },
        req
      });

      return {
        success: false,
        blocked: true,
        sessionId: session.id,
        sql: trimmedSql,
        operation: parsed.operation,
        tables: parsed.tables,
        policyDecision: {
          allow: false,
          violations: policyResult.violations,
          reasons: policyResult.violations.map(v => `Rule ${v} violated: pre-execution access denied.`)
        },
        message: `Query pre-emptively blocked by policy: ${policyResult.violations.join(', ')}`
      };
    }

    // 6. IF ALLOWED: Execute against target FinanceCorpDB database via dedicated connection
    const cleanSql = trimmedSql.endsWith(';') ? trimmedSql.slice(0, -1) : trimmedSql;
    const startTime = Date.now();
    let conn;

    try {
      conn = await mysql.createConnection({
        host: env.DB.HOST,
        port: env.DB.PORT,
        user: env.DB.USER,
        password: env.DB.PASSWORD,
        database: env.DB.TARGET_NAME
      });

      // Execute clean SQL query in target database scope
      const [rows, fields] = await conn.query({
        sql: cleanSql,
        rowsAsArray: false
      });

      const executionTimeMs = Date.now() - startTime;
      await conn.end();
      conn = null;

      const columns = Array.isArray(fields) ? fields.map(f => f.name) : [];
      const rowCount = Array.isArray(rows) ? rows.length : (rows?.affectedRows ?? 0);

      // 7. Check for Post-Hoc Telemetry Anomaly (Unbounded Bulk Read)
      let postHocViolations = [];
      if (parsed.flags.is_unbounded_read && rowCount >= 5) {
        postHocViolations.push('UNBOUNDED_BULK_READ');
      }

      // 8. Record executed SQL event in sql_events
      const [insertEvt] = await pool.execute(
        `INSERT INTO sql_events (
           session_id, user_id, mysql_username, thread_id, event_time,
           raw_sql, normalized_sql, operation, tables, rows_hint, execution_time_ms,
           flags, policy_decision, source_log_id, status
         ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'attributed')`,
        [
          session.id,
          user.id,
          session.mysql_username,
          0,
          trimmedSql,
          parsed.normalized_sql,
          parsed.operation,
          JSON.stringify(parsed.tables),
          rowCount,
          executionTimeMs,
          JSON.stringify(parsed.flags),
          JSON.stringify({ allow: true, violations: postHocViolations }),
          `workspace:${Date.now()}`
        ]
      );

      const eventId = insertEvt.insertId;

      // Record post-hoc violation if unbounded
      if (postHocViolations.includes('UNBOUNDED_BULK_READ')) {
        await pool.execute(
          `INSERT INTO policy_violations (event_id, session_id, user_id, rule, severity, reason, enforcement_type)
           VALUES (?, ?, ?, 'UNBOUNDED_BULK_READ', 'medium', ?, 'detected_post_hoc')`,
          [eventId, session.id, user.id, `Unbounded bulk export: returned ${rowCount} rows without LIMIT clause`]
        );
      }

      // 9. Update Risk Score
      await riskEngineService.evaluateSessionRisk(session.id);

      return {
        success: true,
        blocked: false,
        sessionId: session.id,
        sql: trimmedSql,
        operation: parsed.operation,
        tables: parsed.tables,
        columns,
        rows: Array.isArray(rows) ? rows : [],
        rowCount,
        executionTimeMs,
        policyDecision: {
          allow: true,
          violations: postHocViolations
        }
      };
    } catch (dbErr) {
      if (conn) {
        await conn.end().catch(() => {});
        conn = null;
      }
      const executionTimeMs = Date.now() - startTime;
      logger.error({ err: dbErr.message, sql: trimmedSql }, 'Database execution error in workspace');

      // Record database-level failure/block
      await pool.execute(
        `INSERT INTO sql_events (
           session_id, user_id, mysql_username, thread_id, event_time,
           raw_sql, normalized_sql, operation, tables, execution_time_ms,
           flags, source_log_id, status
         ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, 'attributed')`,
        [
          session.id,
          user.id,
          session.mysql_username,
          0,
          trimmedSql,
          parsed.normalized_sql,
          parsed.operation,
          JSON.stringify(parsed.tables),
          executionTimeMs,
          JSON.stringify(parsed.flags),
          `workspace_err:${Date.now()}`
        ]
      );

      throw new AppError(`Database Error [${dbErr.code || 'ERROR'}]: ${dbErr.message}`, 400, dbErr.code || 'DB_ERROR');
    }
  },

  /**
   * Get query execution history for a session
   */
  async getSessionHistory(sessionId, user) {
    const isElevated = user.roles.some(r => r === 'admin' || r === 'dba');

    const [sessRows] = await pool.execute(
      `SELECT user_id FROM db_sessions WHERE id = ? LIMIT 1`,
      [sessionId]
    );

    if (sessRows.length === 0) {
      throw new AppError('Session not found', 404, 'NOT_FOUND');
    }

    if (!isElevated && sessRows[0].user_id !== user.id) {
      throw new AppError('Unauthorized access to session history', 403, 'FORBIDDEN');
    }

    const [rows] = await pool.execute(
      `SELECT id, session_id, event_time, raw_sql, operation, tables, flags,
              rows_hint, execution_time_ms, policy_decision, status, created_at
       FROM sql_events
       WHERE session_id = ?
       ORDER BY id DESC LIMIT 50`,
      [sessionId]
    );

    return rows.map(r => ({
      ...r,
      tables: typeof r.tables === 'string' ? JSON.parse(r.tables) : r.tables,
      flags: typeof r.flags === 'string' ? JSON.parse(r.flags) : r.flags,
      policy_decision: typeof r.policy_decision === 'string' ? JSON.parse(r.policy_decision) : r.policy_decision
    }));
  }
};
