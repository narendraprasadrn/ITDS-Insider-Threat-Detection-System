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
  async createRequest({ user, profileId, requestedDurationMinutes, justification, timeOfDay: overrideTimeOfDay, req = null }) {
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

    // 6. Record request in database
    const [result] = await pool.execute(
      `INSERT INTO access_requests (
         user_id, profile_id, requested_duration_minutes, justification,
         status, decision_action, decision_reasons,
         requested_operations, requested_resources
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        profile.id,
        duration,
        finalJustification,
        initialStatus === 'active' ? 'approved' : initialStatus,
        decision.action,
        JSON.stringify(decision.reasons || []),
        requestedOpsJson,
        requestedResJson
      ]
    );

    const requestId = result.insertId;

    // Audit log request submission
    await auditService.log({
      eventType: initialStatus === 'active' ? 'ACCESS_REQUEST_ACTIVATED' : 'ACCESS_REQUEST_SUBMITTED',
      userId: user.id,
      username: user.username,
      status: initialStatus === 'denied' ? 'WARNING' : 'SUCCESS',
      details: { requestId, profileName: profile.name, decisionAction: decision.action, autoActivated: initialStatus === 'active' },
      req
    });

    // 7. If Auto-Approved by policy, provision JIT session immediately and activate
    if (initialStatus === 'active') {
      const sessionResult = await sessionService.provisionSession({
        requestId,
        userId: user.id,
        profile,
        durationMinutes: duration
      });

      const endTime = new Date(Date.now() + duration * 60 * 1000);

      // Transition request status to 'active' with timestamps and session link
      await pool.execute(
        `UPDATE access_requests
         SET status = 'active',
             session_id = ?,
             approved_by = ?,
             approved_at = CURRENT_TIMESTAMP,
             activated_at = CURRENT_TIMESTAMP,
             expires_at = ?
         WHERE id = ?`,
        [sessionResult.sessionId, user.id, endTime, requestId]
      );

      return {
        status: 'active',
        session_status: 'active',
        requestId,
        sessionId: sessionResult.sessionId,
        decision,
        credentials: sessionResult.credentials
      };
    }

    // 8. If pending, check whether independent approvers exist in the system (other than requester)
    const [otherApprovers] = await pool.query(
      `SELECT count(DISTINCT u.id) as count
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.name IN ('admin', 'dba') AND u.id != ? AND u.is_active = 1`,
      [user.id]
    );
    const hasIndependentApprover = Number(otherApprovers[0]?.count || 0) > 0;

    // If pending or denied
    return {
      status: initialStatus,
      requestId,
      decision,
      has_independent_approver: hasIndependentApprover,
      message: initialStatus === 'pending'
        ? (hasIndependentApprover
            ? 'Request submitted to independent administrator approval queue.'
            : 'Request submitted, but no independent approver is currently configured in the system.')
        : `Request denied by policy: ${decision.reasons?.join(', ')}`
    };
  },

  /**
   * List access requests with filtering (for Developer: own requests; for Admin/DBA: all requests)
   */
  async listRequests({ user, status, limit = 50, offset = 0 } = {}) {
    const isElevated = user.roles.some(r => r === 'admin' || r === 'dba');

    let sql = `
      SELECT ar.id, ar.user_id, ar.profile_id, ar.session_id,
             ar.approved_by, ar.approved_at, ar.activated_at, ar.expires_at,
             ar.revoked_at, ar.revoked_by,
             ar.requested_duration_minutes, ar.justification,
             ar.status, ar.decision_action, ar.decision_reasons,
             ar.requested_operations, ar.requested_resources,
             ar.created_at, ar.updated_at,
             u.username, u.full_name, u.email,
             p.name AS profile_name, p.risk_level, p.allowed_operations, p.requires_approval,
             approver.username AS approved_by_username,
             ds.mysql_username, ds.status AS session_status,
             (SELECT count(DISTINCT u2.id) FROM users u2
              JOIN user_roles ur2 ON u2.id = ur2.user_id
              JOIN roles r2 ON ur2.role_id = r2.id
              WHERE r2.name IN ('admin', 'dba') AND u2.id != ar.user_id AND u2.is_active = 1) AS independent_approver_count
      FROM access_requests ar
      JOIN users u ON ar.user_id = u.id
      JOIN access_profiles p ON ar.profile_id = p.id
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
      `SELECT ar.id, ar.user_id, ar.profile_id, ar.session_id,
              ar.approved_by, ar.approved_at, ar.activated_at, ar.expires_at,
              ar.revoked_at, ar.revoked_by,
              ar.requested_duration_minutes, ar.justification,
              ar.status, ar.decision_action, ar.decision_reasons,
              ar.requested_operations, ar.requested_resources,
              ar.created_at, ar.updated_at,
              u.username, u.full_name, u.email,
              p.name AS profile_name, p.risk_level,
              approver.username AS approved_by_username,
              ds.mysql_username, ds.status AS session_status, ds.end_time AS session_end_time
       FROM access_requests ar
       JOIN users u ON ar.user_id = u.id
       JOIN access_profiles p ON ar.profile_id = p.id
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
      `SELECT ar.id, ar.user_id, ar.profile_id, ar.requested_duration_minutes,
              ar.justification, ar.status, ar.decision_action, ar.decision_reasons,
              ar.requested_operations, ar.requested_resources,
              ar.created_at,
              u.username, u.full_name, u.email,
              p.name AS profile_name, p.risk_level, p.allowed_operations, p.requires_approval,
              (SELECT count(DISTINCT u2.id) FROM users u2
               JOIN user_roles ur2 ON u2.id = ur2.user_id
               JOIN roles r2 ON ur2.role_id = r2.id
               WHERE r2.name IN ('admin', 'dba') AND u2.id != ar.user_id AND u2.is_active = 1) AS independent_approver_count
       FROM access_requests ar
       JOIN users u ON ar.user_id = u.id
       JOIN access_profiles p ON ar.profile_id = p.id
       WHERE ar.status = 'pending'
       ORDER BY ar.created_at ASC`
    );

    return rows.map(r => ({
      ...r,
      allowed_operations: typeof r.allowed_operations === 'string' ? JSON.parse(r.allowed_operations) : r.allowed_operations,
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
        `SELECT id, user_id, profile_id, requested_duration_minutes, status
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

      // 1. Fetch profile and provision session
      const profile = await profileService.getProfile(accessReq.profile_id);
      const sessionResult = await sessionService.provisionSession({
        requestId,
        userId: accessReq.user_id,
        profile,
        durationMinutes: accessReq.requested_duration_minutes
      });

      const endTime = new Date(Date.now() + accessReq.requested_duration_minutes * 60 * 1000);

      // 2. Update status and link session ID in access_requests
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

      // 3. Record approval record in approvals table
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
