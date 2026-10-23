// backend/src/services/accessRequest.service.js
import { pool } from '../db/pool.js';
import { profileService } from './profile.service.js';
import { policyService } from './policy.service.js';
import { sessionService } from './session.service.js';
import { auditService } from './audit.service.js';
import { AppError } from '../middleware/errorHandler.js';

export const accessRequestService = {
  /**
   * Submit an access request, evaluate via OPA, and transition to:
   * - ACTIVE (if auto-approved by OPA and profile requires no approval)
   * - PENDING (if OPA indicates approval is required)
   * - DENIED (if OPA or RBAC denies)
   */
  async createRequest({ user, profileId, requestedDurationMinutes, justification, timeOfDay: overrideTimeOfDay, replaceExisting = false, req = null }) {
    if (!profileId) {
      throw new AppError('Profile ID is required', 400, 'BAD_REQUEST');
    }

    // 1. Fetch profile details
    const profile = await profileService.getProfile(profileId);

    // 2. Validate user role permissions against profile strictly (server-enforced)
    const permittedRoleNames = profile.roles.map(r => r.name);
    const userHasPermittedRole = user.roles.some(r => permittedRoleNames.includes(r));

    if (!userHasPermittedRole) {
      throw new AppError(
        `Role [${user.roles.join(', ')}] is not permitted to request profile '${profile.name}'`,
        403,
        'FORBIDDEN_PROFILE'
      );
    }

    const isApprovalRequired = Boolean(profile.requires_approval);

    // Business justification is mandatory ONLY for profiles requiring approval
    if (isApprovalRequired && (!justification || !justification.trim())) {
      throw new AppError('Business justification is required for profiles requiring independent approval', 400, 'JUSTIFICATION_REQUIRED');
    }

    const finalJustification = (justification && justification.trim())
      ? justification.trim()
      : `Routine authorized access under profile '${profile.name}'`;

    // Clamp duration within profile's max limit
    const maxPermitted = profile.max_duration_minutes || 60;
    const duration = Math.min(
      Math.max(Number(requestedDurationMinutes) || maxPermitted, 15),
      maxPermitted
    );

    // 3. Determine highest sensitivity rating
    const sensitivityRank = { low: 1, medium: 2, high: 3, critical: 4 };
    let highestSensitivity = 'low';
    for (const r of profile.resources) {
      if (sensitivityRank[r.sensitivity] > sensitivityRank[highestSensitivity]) {
        highestSensitivity = r.sensitivity;
      }
    }

    // Current time HH:MM format for OPA business hours check
    const now = new Date();
    const timeOfDay = overrideTimeOfDay || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 4. Construct OPA Input
    const opaInput = {
      user: {
        id: user.id,
        username: user.username,
        roles: user.roles
      },
      profile: {
        id: profile.id,
        name: profile.name,
        requires_approval: isApprovalRequired
      },
      resources: profile.resources.map(r => ({
        db_name: r.db_name,
        table_name: r.table_name,
        sensitivity: r.sensitivity
      })),
      operations: profile.allowed_operations,
      requested_duration: duration,
      time_of_day: timeOfDay,
      sensitivity: highestSensitivity
    };

    // 5. Evaluate policy in OPA (fails closed if OPA is unavailable)
    const decision = await policyService.evaluateAccessRequest(opaInput);

    let initialStatus = 'pending';
    if (decision.action === 'allow') {
      initialStatus = 'active'; // Auto-approved becomes active upon provisioning
    } else if (decision.action === 'deny') {
      initialStatus = 'denied';
    }

    const requestedOpsJson = JSON.stringify(profile.allowed_operations || ['SELECT']);
    const requestedResJson = JSON.stringify(profile.resources.map(r => `${r.db_name}.${r.table_name}`));

    // 6. Single Active Session Check & Transactional Lifecycle (for auto-approved sessions)
    const isAdmin = user.roles.includes('admin');

    if (initialStatus === 'active') {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Check for existing active sessions for this user with row-level lock
        const [activeRows] = await conn.execute(
          `SELECT s.id, s.request_id, s.user_id, s.profile_id, s.status, s.start_time, s.end_time,
                  s.mysql_username, s.granted_operations, s.granted_resources,
                  p.name AS profile_name, p.risk_level
           FROM db_sessions s
           JOIN access_profiles p ON s.profile_id = p.id
           WHERE s.user_id = ? AND s.status = 'active' AND s.end_time > NOW()
           ORDER BY s.id DESC
           LIMIT 1 FOR UPDATE`,
          [user.id]
        );

        let existingActiveSession = activeRows.length > 0 ? activeRows[0] : null;

        if (existingActiveSession && !isAdmin) {
          const activeOps = typeof existingActiveSession.granted_operations === 'string'
            ? JSON.parse(existingActiveSession.granted_operations)
            : (existingActiveSession.granted_operations || []);
          const activeRes = typeof existingActiveSession.granted_resources === 'string'
            ? JSON.parse(existingActiveSession.granted_resources)
            : (existingActiveSession.granted_resources || []);

          if (!replaceExisting) {
            await conn.rollback();
            conn.release();

            const conflictErr = new AppError(
              `User '${user.username}' already has an active JIT session (#${existingActiveSession.id} - ${existingActiveSession.profile_name}). Only one active session is permitted per user.`,
              409,
              'ACTIVE_SESSION_EXISTS',
              {
                existingSession: {
                  id: existingActiveSession.id,
                  profile_id: existingActiveSession.profile_id,
                  profile_name: existingActiveSession.profile_name,
                  mysql_username: existingActiveSession.mysql_username,
                  database: 'itds_db',
                  granted_operations: activeOps,
                  granted_resources: activeRes,
                  end_time: existingActiveSession.end_time
                },
                requestedProfile: {
                  id: profile.id,
                  name: profile.name,
                  database: 'itds_db',
                  allowed_operations: profile.allowed_operations,
                  resources: profile.resources,
                  duration_minutes: duration
                }
              }
            );
            conflictErr.existingSession = {
              id: existingActiveSession.id,
              profile_id: existingActiveSession.profile_id,
              profile_name: existingActiveSession.profile_name,
              mysql_username: existingActiveSession.mysql_username,
              database: 'itds_db',
              granted_operations: activeOps,
              granted_resources: activeRes,
              end_time: existingActiveSession.end_time
            };
            conflictErr.requestedProfile = {
              id: profile.id,
              name: profile.name,
              database: 'itds_db',
              allowed_operations: profile.allowed_operations,
              resources: profile.resources,
              duration_minutes: duration
            };
            throw conflictErr;
          }
        }

        // Staged replacement: Create request record
        const [result] = await conn.execute(
          `INSERT INTO access_requests (
             user_id, request_type, profile_id, requested_duration_minutes, justification,
             status, decision_action, decision_reasons,
             requested_operations, requested_resources
           ) VALUES (?, 'profile', ?, ?, ?, 'active', ?, ?, ?, ?)`,
          [
            user.id,
            profile.id,
            duration,
            finalJustification,
            decision.action,
            JSON.stringify(decision.reasons || []),
            requestedOpsJson,
            requestedResJson
          ]
        );

        const requestId = result.insertId;

        // If replacing an existing session, update old records to 'revoked' in the transaction first
        // so that active_user_id is cleared and uk_user_single_active_session is satisfied.
        // If subsequent provisioning fails, conn.rollback() restores the old session to 'active'!
        if (existingActiveSession) {
          await conn.execute(
            `UPDATE db_sessions SET status = 'revoked', mysql_password = NULL WHERE id = ?`,
            [existingActiveSession.id]
          );
          await conn.execute(
            `UPDATE access_requests SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = ? OR session_id = ?`,
            [existingActiveSession.request_id, existingActiveSession.id]
          );
        }

        // Provision new MySQL user and store credentials.
        // If this throws, conn.rollback() leaves existing session untouched!
        const sessionResult = await sessionService.provisionSession({
          requestId,
          userId: user.id,
          profile,
          durationMinutes: duration,
          connection: conn
        });

        // Drop old MySQL user after new credentials are created successfully
        if (existingActiveSession) {
          await sessionService.dropMysqlUser(existingActiveSession.mysql_username);
        }

        const endTime = new Date(Date.now() + duration * 60 * 1000);

        // Update new access request with session link and timestamps
        await conn.execute(
          `UPDATE access_requests
           SET session_id = ?,
               approved_by = ?,
               approved_at = CURRENT_TIMESTAMP,
               activated_at = CURRENT_TIMESTAMP,
               expires_at = ?
           WHERE id = ?`,
          [sessionResult.sessionId, user.id, endTime, requestId]
        );

        await conn.commit();
        conn.release();

        // Audit log termination of old session
        if (existingActiveSession) {
          await auditService.log({
            eventType: 'SESSION_REVOKED',
            userId: user.id,
            username: user.username,
            status: 'WARNING',
            details: {
              sessionId: existingActiveSession.id,
              requestId: existingActiveSession.request_id,
              reason: 'REPLACED_BY_NEW_SESSION',
              replacedBySessionId: sessionResult.sessionId,
              newProfileName: profile.name
            },
            req
          });
        }

        // Audit log activation of new session
        await auditService.log({
          eventType: 'ACCESS_REQUEST_ACTIVATED',
          userId: user.id,
          username: user.username,
          status: 'SUCCESS',
          details: {
            requestId,
            sessionId: sessionResult.sessionId,
            profileName: profile.name,
            decisionAction: decision.action,
            autoActivated: true,
            replacedOldSessionId: existingActiveSession ? existingActiveSession.id : null
          },
          req
        });

        return {
          status: 'active',
          session_status: 'active',
          requestId,
          sessionId: sessionResult.sessionId,
          replacedSessionId: existingActiveSession ? existingActiveSession.id : null,
          decision,
          credentials: sessionResult.credentials
        };
      } catch (err) {
        if (conn) {
          try { await conn.rollback(); } catch (_) {}
          conn.release();
        }
        throw err;
      }
    }

    // 7. For pending or denied requests, insert record into access_requests
    const [result] = await pool.execute(
      `INSERT INTO access_requests (
         user_id, request_type, profile_id, requested_duration_minutes, justification,
         status, decision_action, decision_reasons,
         requested_operations, requested_resources
       ) VALUES (?, 'profile', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        profile.id,
        duration,
        finalJustification,
        initialStatus,
        decision.action,
        JSON.stringify(decision.reasons || []),
        requestedOpsJson,
        requestedResJson
      ]
    );

    const requestId = result.insertId;

    await auditService.log({
      eventType: 'ACCESS_REQUEST_SUBMITTED',
      userId: user.id,
      username: user.username,
      status: initialStatus === 'denied' ? 'WARNING' : 'SUCCESS',
      details: { requestId, profileName: profile.name, decisionAction: decision.action },
      req
    });

    // 8. If pending, check whether independent approvers exist in the system (other than requester)
    const hasCritical = profile.resources.some(r => r.sensitivity === 'critical');
    const approverRoleFilter = hasCritical ? "r.name = 'admin'" : "r.name IN ('admin', 'dba')";

    const [otherApprovers] = await pool.query(
      `SELECT count(DISTINCT u.id) as count
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE ${approverRoleFilter} AND u.id != ? AND u.is_active = 1`,
      [user.id]
    );
    const hasIndependentApprover = Number(otherApprovers[0]?.count || 0) > 0;

    return {
      status: initialStatus,
      requestId,
      decision,
      has_independent_approver: hasIndependentApprover,
      message: initialStatus === 'pending'
        ? (hasIndependentApprover
            ? `Request submitted to independent ${hasCritical ? 'Administrator' : 'approver'} queue.`
            : 'Request submitted, but no independent approver is currently configured in the system.')
        : `Request denied by policy: ${decision.reasons?.join(', ')}`
    };
  },

  /**
   * Submit a table-level access request (e.g. Developer requesting Employees, Transactions, etc.)
   */
  async createTableRequest({ user, targetTable, operations = ['SELECT'], requestedDurationMinutes, justification, timeOfDay: overrideTimeOfDay, req = null }) {
    if (!targetTable || !targetTable.trim()) {
      throw new AppError('Target table is required for table-level access request', 400, 'BAD_REQUEST');
    }
    const cleanTable = targetTable.trim();

    // 1. Verify table exists in registered catalog
    const [resRows] = await pool.execute(
      `SELECT id, db_name, table_name, sensitivity, description FROM resources WHERE LOWER(table_name) = LOWER(?) LIMIT 1`,
      [cleanTable]
    );

    if (resRows.length === 0) {
      throw new AppError(`Table '${cleanTable}' is not a registered database catalog resource`, 404, 'TABLE_NOT_FOUND');
    }

    const resource = resRows[0];
    const tableName = resource.table_name;
    const isCritical = ['Payroll', 'TaxRecords', 'SecurityAuditLogs'].includes(tableName) || resource.sensitivity === 'critical';

    // Business justification is mandatory for table-level requests
    if (!justification || !justification.trim()) {
      throw new AppError('Business justification is required for table-level access requests', 400, 'JUSTIFICATION_REQUIRED');
    }

    // Clamp duration (critical tables max 60 min, other tables max 120 min)
    const maxPermitted = isCritical ? 60 : 120;
    const duration = Math.min(
      Math.max(Number(requestedDurationMinutes) || 60, 15),
      maxPermitted
    );

    const targetOps = Array.isArray(operations) && operations.length > 0 ? operations : ['SELECT'];

    const decision = {
      action: 'require_approval',
      reasons: [
        isCritical
          ? `Access involves critical sensitivity table '${tableName}' requiring Administrator approval`
          : `Table-level access to '${tableName}' (${resource.sensitivity} sensitivity) requires supervisor review`
      ]
    };

    const requestedOpsJson = JSON.stringify(targetOps);
    const requestedResJson = JSON.stringify([`${resource.db_name}.${tableName}`]);

    const [result] = await pool.execute(
      `INSERT INTO access_requests (
         user_id, request_type, target_table, target_database, requested_duration_minutes, justification,
         status, decision_action, decision_reasons,
         requested_operations, requested_resources
       ) VALUES (?, 'table', ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        user.id,
        tableName,
        resource.db_name,
        duration,
        justification.trim(),
        decision.action,
        JSON.stringify(decision.reasons),
        requestedOpsJson,
        requestedResJson
      ]
    );

    const requestId = result.insertId;

    await auditService.log({
      eventType: 'ACCESS_REQUEST_SUBMITTED',
      userId: user.id,
      username: user.username,
      status: 'SUCCESS',
      details: {
        requestId,
        requestType: 'table',
        targetTable: tableName,
        isCritical,
        decisionAction: decision.action
      },
      req
    });

    const [otherApprovers] = await pool.query(
      `SELECT count(DISTINCT u.id) as count
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE ${isCritical ? "r.name = 'admin'" : "r.name IN ('admin', 'dba')"} AND u.id != ? AND u.is_active = 1`,
      [user.id]
    );
    const hasIndependentApprover = Number(otherApprovers[0]?.count || 0) > 0;

    return {
      status: 'pending',
      requestId,
      request_type: 'table',
      target_table: tableName,
      decision,
      has_independent_approver: hasIndependentApprover,
      message: hasIndependentApprover
        ? `Request for table '${tableName}' submitted to ${isCritical ? 'Administrator' : 'DBA / Administrator'} approval queue.`
        : 'Request submitted, but no independent approver is currently configured.'
    };
  },

  /**
   * List access requests with filtering (for Developer: own requests; for Admin/DBA: all requests)
   */
  async listRequests({ user, status, limit = 50, offset = 0 } = {}) {
    const isElevated = user.roles.some(r => r === 'admin' || r === 'dba');

    let sql = `
      SELECT ar.id, ar.user_id, ar.request_type, ar.target_table, ar.target_database,
             ar.profile_id, ar.session_id,
             ar.approved_by, ar.approved_at, ar.activated_at, ar.expires_at,
             ar.revoked_at, ar.revoked_by,
             ar.requested_duration_minutes, ar.justification,
             ar.status, ar.decision_action, ar.decision_reasons,
             ar.requested_operations, ar.requested_resources,
             ar.created_at, ar.updated_at,
             u.username, u.full_name, u.email,
             COALESCE(p.name, CONCAT('Table Access: ', ar.target_table)) AS profile_name,
             COALESCE(p.risk_level, CASE WHEN ar.target_table IN ('Payroll', 'TaxRecords', 'SecurityAuditLogs') THEN 'critical' ELSE 'medium' END) AS risk_level,
             p.allowed_operations, p.requires_approval,
             approver.username AS approved_by_username,
             ds.mysql_username, ds.status AS session_status,
             (SELECT count(DISTINCT u2.id) FROM users u2
              JOIN user_roles ur2 ON u2.id = ur2.user_id
              JOIN roles r2 ON ur2.role_id = r2.id
              WHERE (
                (ar.target_table IN ('Payroll', 'TaxRecords', 'SecurityAuditLogs') AND r2.name = 'admin')
                OR (COALESCE(ar.target_table, '') NOT IN ('Payroll', 'TaxRecords', 'SecurityAuditLogs') AND r2.name IN ('admin', 'dba'))
              ) AND u2.id != ar.user_id AND u2.is_active = 1) AS independent_approver_count
      FROM access_requests ar
      JOIN users u ON ar.user_id = u.id
      LEFT JOIN access_profiles p ON ar.profile_id = p.id
      LEFT JOIN users approver ON ar.approved_by = approver.id
      LEFT JOIN db_sessions ds ON ar.session_id = ds.id
      WHERE 1=1
    `;
    const params = [];

    // Developers only see their own requests
    if (!isElevated) {
      sql += ' AND ar.user_id = ?';
      params.push(user.id);
    }

    if (status) {
      sql += ' AND ar.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY ar.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const [rows] = await pool.query(sql, params);

    return rows.map(r => ({
      ...r,
      decision_reasons: typeof r.decision_reasons === 'string' ? JSON.parse(r.decision_reasons) : (r.decision_reasons || []),
      allowed_operations: typeof r.allowed_operations === 'string' ? JSON.parse(r.allowed_operations) : (r.allowed_operations || []),
      requested_operations: typeof r.requested_operations === 'string' ? JSON.parse(r.requested_operations) : (r.requested_operations || []),
      requested_resources: typeof r.requested_resources === 'string' ? JSON.parse(r.requested_resources) : (r.requested_resources || [])
    }));
  },

  /**
   * Get single request details by ID
   */
  async getRequestById(requestId, user) {
    const isElevated = user.roles.some(r => r === 'admin' || r === 'dba');

    const [rows] = await pool.execute(
      `SELECT ar.id, ar.user_id, ar.request_type, ar.target_table, ar.target_database,
              ar.profile_id, ar.session_id,
              ar.approved_by, ar.approved_at, ar.activated_at, ar.expires_at,
              ar.revoked_at, ar.revoked_by,
              ar.requested_duration_minutes, ar.justification,
              ar.status, ar.decision_action, ar.decision_reasons,
              ar.requested_operations, ar.requested_resources,
              ar.created_at, ar.updated_at,
              u.username, u.full_name, u.email,
              COALESCE(p.name, CONCAT('Table Access: ', ar.target_table)) AS profile_name,
              COALESCE(p.risk_level, CASE WHEN ar.target_table IN ('Payroll', 'TaxRecords', 'SecurityAuditLogs') THEN 'critical' ELSE 'medium' END) AS risk_level,
              approver.username AS approved_by_username,
              ds.mysql_username, ds.status AS session_status, ds.end_time AS session_end_time
       FROM access_requests ar
       JOIN users u ON ar.user_id = u.id
       LEFT JOIN access_profiles p ON ar.profile_id = p.id
       LEFT JOIN users approver ON ar.approved_by = approver.id
       LEFT JOIN db_sessions ds ON ar.session_id = ds.id
       WHERE ar.id = ? LIMIT 1`,
      [requestId]
    );

    if (rows.length === 0) {
      throw new AppError('Access request not found', 404, 'NOT_FOUND');
    }

    const req = rows[0];
    if (!isElevated && req.user_id !== user.id) {
      throw new AppError('Unauthorized access to request details', 403, 'FORBIDDEN');
    }

    return {
      ...req,
      decision_reasons: typeof req.decision_reasons === 'string' ? JSON.parse(req.decision_reasons) : (req.decision_reasons || []),
      requested_operations: typeof req.requested_operations === 'string' ? JSON.parse(req.requested_operations) : (req.requested_operations || []),
      requested_resources: typeof req.requested_resources === 'string' ? JSON.parse(req.requested_resources) : (req.requested_resources || [])
    };
  },

  /**
   * List pending access requests for administrator review
   */
  async listPendingRequests() {
    const [rows] = await pool.query(
      `SELECT ar.id, ar.user_id, ar.request_type, ar.target_table, ar.target_database,
              ar.profile_id, ar.requested_duration_minutes,
              ar.justification, ar.status, ar.decision_action, ar.decision_reasons,
              ar.requested_operations, ar.requested_resources,
              ar.created_at,
              u.username, u.full_name, u.email,
              COALESCE(p.name, CONCAT('Table Access: ', ar.target_table)) AS profile_name,
              COALESCE(p.risk_level, CASE WHEN ar.target_table IN ('Payroll', 'TaxRecords', 'SecurityAuditLogs') THEN 'critical' ELSE 'medium' END) AS risk_level,
              p.allowed_operations, p.requires_approval,
              (SELECT count(DISTINCT u2.id) FROM users u2
               JOIN user_roles ur2 ON u2.id = ur2.user_id
               JOIN roles r2 ON ur2.role_id = r2.id
               WHERE (
                 (ar.target_table IN ('Payroll', 'TaxRecords', 'SecurityAuditLogs') AND r2.name = 'admin')
                 OR (COALESCE(ar.target_table, '') NOT IN ('Payroll', 'TaxRecords', 'SecurityAuditLogs') AND r2.name IN ('admin', 'dba'))
               ) AND u2.id != ar.user_id AND u2.is_active = 1) AS independent_approver_count
       FROM access_requests ar
       JOIN users u ON ar.user_id = u.id
       LEFT JOIN access_profiles p ON ar.profile_id = p.id
       WHERE ar.status = 'pending'
       ORDER BY ar.created_at ASC`
    );

    return rows.map(r => ({
      ...r,
      allowed_operations: typeof r.allowed_operations === 'string' ? JSON.parse(r.allowed_operations) : (r.allowed_operations || ['SELECT']),
      requested_operations: typeof r.requested_operations === 'string' ? JSON.parse(r.requested_operations) : (r.requested_operations || []),
      requested_resources: typeof r.requested_resources === 'string' ? JSON.parse(r.requested_resources) : (r.requested_resources || []),
      decision_reasons: typeof r.decision_reasons === 'string' ? JSON.parse(r.decision_reasons) : r.decision_reasons
    }));
  },

  /**
   * Admin/DBA approves pending request -> provisions JIT session and activates
   * Protected with database transaction and row-level locking to prevent race conditions.
   */
  async approveRequest(requestId, decidingUser, comments = '') {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [reqRows] = await conn.execute(
        `SELECT id, user_id, request_type, target_table, target_database, profile_id,
                requested_duration_minutes, status, requested_operations, requested_resources
         FROM access_requests WHERE id = ? FOR UPDATE`,
        [requestId]
      );

      if (reqRows.length === 0) {
        throw new AppError('Access request not found', 404, 'NOT_FOUND');
      }

      const accessReq = reqRows[0];
      if (accessReq.status !== 'pending') {
        throw new AppError(`Cannot approve request with status '${accessReq.status}'`, 400, 'BAD_REQUEST');
      }

      // Enforce separation of duties: prevent self-approval on approval-mandated requests
      if (accessReq.user_id === decidingUser.id) {
        throw new AppError(
          'Self-approval is strictly prohibited. Requests requiring independent review must be approved by another administrator or DBA.',
          403,
          'FORBIDDEN_SELF_APPROVAL'
        );
      }

      const isDecidingAdmin = decidingUser.roles.includes('admin');

      // Check authority tier for table-level requests
      if (accessReq.request_type === 'table') {
        const isCriticalTable = ['Payroll', 'TaxRecords', 'SecurityAuditLogs'].includes(accessReq.target_table);
        if (isCriticalTable && !isDecidingAdmin) {
          throw new AppError(
            `DBA is not authorized to approve critical sensitivity resources ('${accessReq.target_table}'). Approval is strictly restricted to Admin.`,
            403,
            'FORBIDDEN_APPROVAL_TIER'
          );
        }

        // Check if user has an active session to attach grant to
        const [activeSessions] = await conn.execute(
          `SELECT id, user_id, profile_id, mysql_username, end_time, granted_operations, granted_resources
           FROM db_sessions
           WHERE user_id = ? AND status = 'active' AND end_time > NOW()
           ORDER BY id DESC LIMIT 1 FOR UPDATE`,
          [accessReq.user_id]
        );

        const targetTable = accessReq.target_table;
        const targetDb = accessReq.target_database || 'itds_db';
        const fullTableIdentifier = `${targetDb}.${targetTable}`;
        const ops = (typeof accessReq.requested_operations === 'string'
          ? JSON.parse(accessReq.requested_operations)
          : accessReq.requested_operations) || ['SELECT'];

        let finalSessionId;
        let sessionCredentials = null;

        if (activeSessions.length > 0) {
          // Dynamic Grant Attachment to existing active session
          const activeSession = activeSessions[0];
          finalSessionId = activeSession.id;

          const currentResources = typeof activeSession.granted_resources === 'string'
            ? JSON.parse(activeSession.granted_resources)
            : activeSession.granted_resources;
          const currentOps = typeof activeSession.granted_operations === 'string'
            ? JSON.parse(activeSession.granted_operations)
            : activeSession.granted_operations;

          const updatedResources = [...new Set([...currentResources, fullTableIdentifier, targetTable])];
          const updatedOps = [...new Set([...currentOps, ...ops])];

          // Update active session grants
          await conn.execute(
            `UPDATE db_sessions
             SET granted_resources = ?, granted_operations = ?
             WHERE id = ?`,
            [JSON.stringify(updatedResources), JSON.stringify(updatedOps), activeSession.id]
          );

          // Apply MySQL grants dynamically
          const tableOps = ops.filter(op => ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(op));
          if (tableOps.length > 0) {
            const grantsList = tableOps.join(', ');
            await conn.query(`GRANT ${grantsList} ON \`${targetDb}\`.\`${targetTable}\` TO '${activeSession.mysql_username}'@'%'`);
            await conn.query(`GRANT ${grantsList} ON \`${targetDb}\`.\`${targetTable}\` TO '${activeSession.mysql_username}'@'localhost'`);
            await conn.query('FLUSH PRIVILEGES');
          }

          // Update access request
          await conn.execute(
            `UPDATE access_requests
             SET status = 'active',
                 session_id = ?,
                 approved_by = ?,
                 approved_at = CURRENT_TIMESTAMP,
                 activated_at = CURRENT_TIMESTAMP,
                 expires_at = ?
             WHERE id = ?`,
            [activeSession.id, decidingUser.id, activeSession.end_time, requestId]
          );
        } else {
          // Provision new session scoped to this approved table
          const fallbackProfile = await profileService.getProfile(1);
          const sessionResult = await sessionService.provisionSession({
            requestId,
            userId: accessReq.user_id,
            profile: {
              ...fallbackProfile,
              name: `Table Grant: ${targetTable}`,
              allowed_operations: ops,
              resources: [{ db_name: targetDb, table_name: targetTable, sensitivity: isCriticalTable ? 'critical' : 'medium' }]
            },
            durationMinutes: accessReq.requested_duration_minutes
          });

          finalSessionId = sessionResult.sessionId;
          sessionCredentials = sessionResult.credentials;
          const endTime = new Date(Date.now() + accessReq.requested_duration_minutes * 60 * 1000);

          await conn.execute(
            `UPDATE access_requests
             SET status = 'active',
                 session_id = ?,
                 approved_by = ?,
                 approved_at = CURRENT_TIMESTAMP,
                 activated_at = CURRENT_TIMESTAMP,
                 expires_at = ?
             WHERE id = ?`,
            [finalSessionId, decidingUser.id, endTime, requestId]
          );
        }

        await conn.execute(
          `INSERT INTO approvals (request_id, decided_by, decision, comments) VALUES (?, ?, 'approved', ?)`,
          [requestId, decidingUser.id, comments]
        );

        await conn.commit();

        await auditService.log({
          eventType: 'ACCESS_REQUEST_APPROVED',
          userId: accessReq.user_id,
          username: decidingUser.username,
          status: 'SUCCESS',
          details: {
            requestId,
            requestType: 'table',
            targetTable,
            sessionId: finalSessionId,
            approvedBy: decidingUser.username,
            comments
          }
        });

        return {
          success: true,
          requestId,
          sessionId: finalSessionId,
          attached_to_existing_session: activeSessions.length > 0,
          credentials: sessionCredentials
        };
      }

      // Profile-level request approval flow
      const profile = await profileService.getProfile(accessReq.profile_id);

      // Check if profile has critical resources (e.g. Executive Payroll & Compensation)
      const hasCriticalResource = (profile.resources || []).some(r => r.sensitivity === 'critical');
      if (hasCriticalResource && !isDecidingAdmin) {
        throw new AppError(
          `DBA is not authorized to approve critical sensitivity profiles. Approval must be granted by an Administrator.`,
          403,
          'FORBIDDEN_APPROVAL_TIER'
        );
      }

      // Check if target user has an existing active session with lock
      const [existingActiveRows] = await conn.execute(
        `SELECT id, request_id, mysql_username, profile_id FROM db_sessions
         WHERE user_id = ? AND status = 'active' AND end_time > NOW()
         ORDER BY id DESC FOR UPDATE`,
        [accessReq.user_id]
      );

      // Safely replace and terminate old session if one existed before inserting new session
      if (existingActiveRows.length > 0) {
        for (const oldSess of existingActiveRows) {
          await conn.execute(
            `UPDATE db_sessions SET status = 'revoked', mysql_password = NULL WHERE id = ?`,
            [oldSess.id]
          );
          await conn.execute(
            `UPDATE access_requests SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = ? OR session_id = ?`,
            [oldSess.request_id, oldSess.id]
          );
        }
      }

      // Provision new session
      const sessionResult = await sessionService.provisionSession({
        requestId,
        userId: accessReq.user_id,
        profile,
        durationMinutes: accessReq.requested_duration_minutes,
        connection: conn
      });

      if (existingActiveRows.length > 0) {
        for (const oldSess of existingActiveRows) {
          await sessionService.dropMysqlUser(oldSess.mysql_username);
          await auditService.log({
            eventType: 'SESSION_REVOKED',
            userId: accessReq.user_id,
            username: decidingUser.username,
            status: 'WARNING',
            details: {
              sessionId: oldSess.id,
              requestId: oldSess.request_id,
              reason: 'REPLACED_BY_APPROVED_SESSION',
              replacedBySessionId: sessionResult.sessionId
            }
          });
        }
      }

      const endTime = new Date(Date.now() + accessReq.requested_duration_minutes * 60 * 1000);

      await conn.execute(
        `UPDATE access_requests
         SET status = 'active',
             session_id = ?,
             approved_by = ?,
             approved_at = CURRENT_TIMESTAMP,
             activated_at = CURRENT_TIMESTAMP,
             expires_at = ?
         WHERE id = ?`,
        [sessionResult.sessionId, decidingUser.id, endTime, requestId]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, decided_by, decision, comments) VALUES (?, ?, 'approved', ?)`,
        [requestId, decidingUser.id, comments]
      );

      await conn.commit();

      await auditService.log({
        eventType: 'ACCESS_REQUEST_APPROVED',
        userId: accessReq.user_id,
        username: decidingUser.username,
        status: 'SUCCESS',
        details: {
          requestId,
          sessionId: sessionResult.sessionId,
          approvedBy: decidingUser.username,
          comments
        }
      });

      return {
        success: true,
        requestId,
        sessionId: sessionResult.sessionId,
        credentials: sessionResult.credentials
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * Admin/DBA denies pending request
   * Protected with database transaction and row-level locking.
   */
  async denyRequest(requestId, decidingUser, comments = '') {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [reqRows] = await conn.execute(
        `SELECT id, user_id, status FROM access_requests WHERE id = ? FOR UPDATE`,
        [requestId]
      );

      if (reqRows.length === 0) {
        throw new AppError('Access request not found', 404, 'NOT_FOUND');
      }

      const accessReq = reqRows[0];
      if (accessReq.status !== 'pending') {
        throw new AppError(`Cannot deny request with status '${accessReq.status}'`, 400, 'BAD_REQUEST');
      }

      await conn.execute(
        `UPDATE access_requests
         SET status = 'denied',
             approved_by = ?,
             approved_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [decidingUser.id, requestId]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, decided_by, decision, comments) VALUES (?, ?, 'denied', ?)`,
        [requestId, decidingUser.id, comments]
      );

      await conn.commit();

      await auditService.log({
        eventType: 'ACCESS_REQUEST_DENIED',
        userId: accessReq.user_id,
        username: decidingUser.username,
        status: 'WARNING',
        details: { requestId, deniedBy: decidingUser.username, comments }
      });

      return { success: true, requestId, message: 'Access request denied' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
};
