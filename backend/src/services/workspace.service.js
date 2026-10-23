// backend/src/services/workspace.service.js
import mysql from 'mysql2/promise';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { sqlParserService } from './sqlParser.service.js';
import { policyService } from './policy.service.js';
import { riskEngineService } from './riskEngine.service.js';
import { auditService } from './audit.service.js';
import { sseService } from './sse.service.js';
import { violationService } from './violation.service.js';
import { AppError } from '../middleware/errorHandler.js';

export const workspaceService = {
  /**
   * Execute SQL query through active JIT session with pre-execution OPA policy enforcement
   * Distinguishes ALLOWED, DENIED, REVIEW, and POST-EXECUTION DETECTED
   */
  async executeQuery({ user, sessionId, sql, req = null }) {
    if (!sessionId || !sql || !sql.trim()) {
      throw new AppError('Session ID and SQL query are required', 400, 'BAD_REQUEST');
    }

    const trimmedSql = sql.trim();

    // 1. Fetch and validate active JIT session
    const [sessRows] = await pool.execute(
      `SELECT s.id, s.request_id, s.user_id, s.profile_id, s.status, s.start_time, s.end_time,
              s.mysql_username, s.mysql_password, s.granted_operations, s.granted_resources,
              p.name AS profile_name, p.max_rows_hint, p.risk_level
       FROM db_sessions s
       JOIN access_profiles p ON s.profile_id = p.id
       WHERE s.id = ? LIMIT 1`,
      [sessionId]
    );

    if (sessRows.length === 0) {
      throw new AppError('Session not found', 404, 'NOT_FOUND');
    }

    const session = sessRows[0];

    // Strict boundary: user can only execute against their own session to avoid cross-profile execution
    if (session.user_id !== user.id) {
      throw new AppError(
        'You are only authorized to execute queries against your own active JIT session',
        403,
        'FORBIDDEN_SESSION'
      );
    }

    const isExpired = session.status !== 'active' || new Date(session.end_time) <= new Date();
    if (isExpired) {
      const expMsg = `Session #${sessionId} is ${session.status === 'active' ? 'expired' : session.status}. Query execution is denied.`;

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
          trimmedSql,
          'UNKNOWN',
          JSON.stringify([]),
          JSON.stringify({ is_expired: true }),
          JSON.stringify({ outcome: 'DENY', allow: false, deny: true, violations: ['SESSION_EXPIRED'], reasons: [expMsg] }),
          `ws_expired_blocked:${Date.now()}`
        ]
      );

      const eventId = blockedEvent.insertId;

      await pool.execute(
        `INSERT INTO policy_violations (event_id, session_id, user_id, rule, severity, reason, enforcement_type)
         VALUES (?, ?, ?, 'SESSION_EXPIRED', 'critical', ?, 'blocked_pre_execution')`,
        [eventId, session.id, user.id, expMsg]
      );

      await auditService.log({
        eventType: 'SQL_BLOCKED_BY_POLICY',
        userId: user.id,
        username: user.username,
        status: 'WARNING',
        details: {
          sessionId: session.id,
          sql: trimmedSql,
          enforcementOutcome: 'BLOCKED PRE-EXECUTION',
          outcome: 'DENIED',
          rule: 'SESSION_EXPIRED',
          explanation: expMsg
        },
        req
      });

      return {
        success: false,
        blocked: true,
        outcome: 'BLOCKED PRE-EXECUTION',
        rule: 'SESSION_EXPIRED',
        message: 'Query Blocked by Security Policy',
        explanation: expMsg,
        eventId,
        sessionId: session.id,
        sql: trimmedSql,
        operation: 'UNKNOWN',
        tables: [],
        rows: [],
        rowCount: 0,
        columns: [],
        policyDecision: {
          outcome: 'DENY',
          allow: false,
          deny: true,
          violations: ['SESSION_EXPIRED'],
          reasons: [expMsg]
        }
      };
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
    const isUnboundedExempt = [
      'Admin Security Administration',
      'DBA Operations Profile',
      'DBA Maintenance Profile'
    ].includes(session.profile_name);

    let policyResult;
    try {
      policyResult = await policyService.evaluateSqlQuery(
        {
          session_id: session.id,
          user_id: user.id,
          profile_name: session.profile_name,
          user_roles: user.roles,
          allow_unbounded_reads: isUnboundedExempt,
          granted_operations: grantedOps,
          granted_resources: grantedRes,
          critical_resources: [
            'FinanceCorpDB.Payroll', 'FinanceCorpDB.TaxRecords', 'FinanceCorpDB.SecurityAuditLogs',
            'Payroll', 'TaxRecords', 'SecurityAuditLogs'
          ],
          is_expired: false
        },
        {
          operation: parsed.operation,
          tables: parsed.tables,
          has_where: parsed.flags.has_where,
          select_star: parsed.flags.select_star,
          has_limit: parsed.flags.has_limit,
          is_ddl: parsed.flags.is_ddl,
          is_cross_schema: parsed.flags.is_cross_schema,
          is_unbounded_read: parsed.flags.is_unbounded_read
        }
      );
    } catch (policyErr) {
      logger.error({ err: policyErr.message, session: session.id, sql: trimmedSql }, 'OPA policy evaluation failed - FAILING CLOSED');
      policyResult = {
        outcome: 'DENY',
        allow: false,
        deny: true,
        violations: ['POLICY_EVALUATION_FAILED'],
        reasons: [`Authorization service error: ${policyErr.message}. Query blocked by fail-closed security rule.`]
      };
    }

    // 5. IF POLICY BLOCKS QUERY: Block pre-execution
    // Query is ONLY authorized to execute against MySQL if policy explicitly allows it with 0 violations
    const isAuthorized = policyResult.allow === true && policyResult.outcome === 'ALLOW' && (!policyResult.violations || policyResult.violations.length === 0);
    const isBlocked = !isAuthorized;

    if (isBlocked) {
      const primaryViolation = (policyResult.violations && policyResult.violations.length > 0)
        ? policyResult.violations[0]
        : 'UNAUTHORIZED_QUERY';

      let explanation = policyResult.reasons?.[0];
      if (primaryViolation === 'UNBOUNDED_BULK_READ') {
        explanation = 'Unbounded read requires approval or a restrictive LIMIT clause';
      } else if (primaryViolation === 'TABLE_OUT_OF_SCOPE') {
        explanation = `Access to table(s) ${parsed.tables.join(', ')} is not permitted in active profile '${session.profile_name}'`;
      } else if (primaryViolation === 'OPERATION_NOT_GRANTED') {
        explanation = `Operation '${parsed.operation}' is not granted in active profile '${session.profile_name}'`;
      } else if (primaryViolation === 'UNAUTHORIZED_DDL') {
        explanation = `DDL schema alteration statements are prohibited in profile '${session.profile_name}'`;
      } else if (!explanation) {
        explanation = 'Query execution was denied prior to database access by security policy';
      }

      logger.warn(
        { sessionId: session.id, user: user.username, rule: primaryViolation, sql: trimmedSql },
        'SQL query PRE-EMPTIVELY BLOCKED by policy in workspace'
      );

      // Record blocked event in sql_events with status 'blocked'
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

      // Persist policy violations with enforcement_type 'blocked_pre_execution'
      for (const rule of (policyResult.violations || [primaryViolation])) {
        const violationReason = rule === 'UNBOUNDED_BULK_READ'
          ? 'Unbounded read requires approval or a restrictive LIMIT clause'
          : (explanation || `Blocked pre-execution: rule '${rule}' violated`);

        const [vRes] = await pool.execute(
          `INSERT INTO policy_violations (event_id, session_id, user_id, rule, severity, reason, enforcement_type)
           VALUES (?, ?, ?, ?, 'high', ?, 'blocked_pre_execution')`,
          [eventId, session.id, user.id, rule, violationReason]
        );

        violationService.emitViolation({
          id: vRes.insertId,
          event_id: eventId,
          session_id: session.id,
          user_id: user.id,
          rule,
          severity: 'high',
          reason: violationReason,
          enforcement_type: 'blocked_pre_execution',
          created_at: new Date()
        });
      }

      // Broadcast blocked query observed to SSE stream (Admin & DBA consoles)
      sseService.broadcast('query_observed', {
        id: eventId,
        session_id: session.id,
        user_id: user.id,
        username: user.username,
        mysql_username: session.mysql_username,
        thread_id: 0,
        event_time: new Date().toISOString(),
        raw_sql: trimmedSql,
        normalized_sql: parsed.normalized_sql,
        operation: parsed.operation,
        tables: parsed.tables,
        flags: parsed.flags,
        status: 'blocked',
        policy_decision: policyResult
      });

      // Update session risk assessment
      await riskEngineService.evaluateSessionRisk(session.id);

      // Audit log the blocked attempt with enforcementOutcome 'BLOCKED PRE-EXECUTION'
      await auditService.log({
        eventType: 'SQL_BLOCKED_BY_POLICY',
        userId: user.id,
        username: user.username,
        status: 'WARNING',
        details: {
          sessionId: session.id,
          sql: trimmedSql,
          enforcementOutcome: 'BLOCKED PRE-EXECUTION',
          outcome: 'DENIED',
          rule: primaryViolation,
          explanation,
          violations: policyResult.violations,
          reasons: policyResult.reasons
        },
        req
      });

      // Never execute against MySQL. Return zero rows.
      return {
        success: false,
        blocked: true,
        outcome: 'BLOCKED PRE-EXECUTION',
        rule: primaryViolation,
        message: 'Query Blocked by Security Policy',
        explanation,
        eventId,
        sessionId: session.id,
        sql: trimmedSql,
        operation: parsed.operation,
        tables: parsed.tables,
        rows: [],
        rowCount: 0,
        columns: [],
        policyDecision: {
          outcome: 'DENY',
          allow: false,
          deny: true,
          violations: policyResult.violations,
          reasons: [explanation]
        }
      };
    }

    // 6. IF AUTHORIZED: Execute against target database using restricted JIT session credentials
    const cleanSql = trimmedSql.endsWith(';') ? trimmedSql.slice(0, -1) : trimmedSql;
    const startTime = Date.now();
    let conn;

    try {
      // Connect using the actual ephemeral JIT MySQL credentials
      const dbUser = session.mysql_password ? session.mysql_username : env.DB.USER;
      const dbPassword = session.mysql_password || env.DB.PASSWORD;

      conn = await mysql.createConnection({
        host: env.DB.HOST,
        port: env.DB.PORT,
        user: dbUser,
        password: dbPassword,
        database: env.DB.TARGET_NAME
      });

      const connectionThreadId = conn.threadId || 0;

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

      // 7. Check for Behavioral Outcomes: ALLOWED or POST-EXECUTION DETECTED
      const maxRowsHint = session.max_rows_hint || 500;
      let outcome = 'ALLOWED';
      let violationsToRecord = [];

      if (!isUnboundedExempt && rowCount > maxRowsHint) {
        outcome = 'POST-EXECUTION DETECTED';
        violationsToRecord = ['UNBOUNDED_BULK_READ'];
      }

      // 8. Record executed SQL event in sql_events with status 'attributed'
      const workspaceLogId = `workspace:${session.id}:${connectionThreadId}:${Date.now()}`;
      const [insertEvt] = await pool.execute(
        `INSERT INTO sql_events (
           session_id, user_id, mysql_username, thread_id, event_time,
           raw_sql, normalized_sql, operation, tables, rows_hint, execution_time_ms,
           flags, policy_decision, source_log_id, status
         ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'attributed')
         ON DUPLICATE KEY UPDATE execution_time_ms = VALUES(execution_time_ms)`,
        [
          session.id,
          user.id,
          session.mysql_username,
          connectionThreadId,
          trimmedSql,
          parsed.normalized_sql,
          parsed.operation,
          JSON.stringify(parsed.tables),
          rowCount,
          executionTimeMs,
          JSON.stringify(parsed.flags),
          JSON.stringify({ outcome, allow: outcome === 'ALLOWED', violations: violationsToRecord }),
          workspaceLogId
        ]
      );

      const eventId = insertEvt.insertId;

      // 9. Persist violations if post-hoc anomaly
      for (const rule of violationsToRecord) {
        const enforcementType = 'detected_post_hoc';
        const reason = `Post-execution anomaly: query returned ${rowCount} rows exceeding threshold (${maxRowsHint})`;

        const [vRes] = await pool.execute(
          `INSERT INTO policy_violations (event_id, session_id, user_id, rule, severity, reason, enforcement_type)
           VALUES (?, ?, ?, ?, 'medium', ?, ?)`,
          [eventId, session.id, user.id, rule, reason, enforcementType]
        );

        violationService.emitViolation({
          id: vRes.insertId,
          event_id: eventId,
          session_id: session.id,
          user_id: user.id,
          rule,
          severity: 'medium',
          reason,
          enforcement_type: enforcementType,
          created_at: new Date()
        });
      }

      // Broadcast executed query observed to SSE stream (Admin & DBA consoles)
      sseService.broadcast('query_observed', {
        id: eventId,
        session_id: session.id,
        user_id: user.id,
        username: user.username,
        mysql_username: session.mysql_username,
        thread_id: 0,
        event_time: new Date().toISOString(),
        raw_sql: trimmedSql,
        normalized_sql: parsed.normalized_sql,
        operation: parsed.operation,
        tables: parsed.tables,
        flags: parsed.flags,
        status: 'attributed',
        policy_decision: { outcome, allow: outcome === 'ALLOWED', violations: violationsToRecord }
      });

      if (violationsToRecord.length > 0) {
        await riskEngineService.evaluateSessionRisk(session.id);
      }

      // Audit log execution
      await auditService.log({
        eventType: outcome === 'ALLOWED' ? 'SQL_EXECUTED' : 'SQL_POLICY_FLAGGED',
        userId: user.id,
        username: user.username,
        status: outcome === 'ALLOWED' ? 'SUCCESS' : 'WARNING',
        details: {
          sessionId: session.id,
          sql: trimmedSql,
          enforcementOutcome: outcome === 'ALLOWED' ? 'ALLOWED' : 'DETECTED POST-EXECUTION',
          outcome,
          rowCount,
          executionTimeMs,
          violations: violationsToRecord
        },
        req
      });

      return {
        success: true,
        blocked: false,
        outcome,
        enforcementOutcome: outcome === 'ALLOWED' ? 'ALLOWED' : 'DETECTED POST-EXECUTION',
        eventId,
        sessionId: session.id,
        sql: trimmedSql,
        operation: parsed.operation,
        tables: parsed.tables,
        columns,
        rows: Array.isArray(rows) ? rows : [],
        rowCount,
        executionTimeMs,
        policyDecision: {
          outcome,
          allow: outcome === 'ALLOWED',
          violations: violationsToRecord,
          reasons: violationsToRecord.length === 0
            ? ['Query fully compliant with session grant']
            : [`Query executed with telemetry flag: ${violationsToRecord.join(', ')}`]
        }
      };
    } catch (dbErr) {
      if (conn) {
        await conn.end().catch(() => {});
        conn = null;
      }
      const executionTimeMs = Date.now() - startTime;
      logger.error({ err: dbErr.message, sql: trimmedSql }, 'Database execution error in workspace');

      // Record database-level failure
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
  },

  /**
   * Get policy violations for a session (scoped to session owner or elevated admin/dba)
   */
  async getSessionViolations(sessionId, user) {
    const isElevated = user.roles.some(r => r === 'admin' || r === 'dba');

    const [sessRows] = await pool.execute(
      `SELECT user_id FROM db_sessions WHERE id = ? LIMIT 1`,
      [sessionId]
    );

    if (sessRows.length === 0) {
      throw new AppError('Session not found', 404, 'NOT_FOUND');
    }

    if (!isElevated && sessRows[0].user_id !== user.id) {
      throw new AppError('Unauthorized access to session violations', 403, 'FORBIDDEN');
    }

    const [rows] = await pool.execute(
      `SELECT pv.id, pv.event_id, pv.session_id, pv.user_id, pv.rule, pv.severity,
              pv.reason, pv.enforcement_type, pv.created_at,
              se.raw_sql, se.operation
       FROM policy_violations pv
       INNER JOIN sql_events se ON pv.event_id = se.id
       WHERE pv.session_id = ?
       ORDER BY pv.id DESC LIMIT 50`,
      [sessionId]
    );

    return rows;
  }
};
