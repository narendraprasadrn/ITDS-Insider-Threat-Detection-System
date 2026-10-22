// backend/src/services/accessRequest.service.js
import { pool } from '../db/pool.js';
import { profileService } from './profile.service.js';
import { policyService } from './policy.service.js';
import { sessionService } from './session.service.js';
import { auditService } from './audit.service.js';
import { AppError } from '../middleware/errorHandler.js';

export const accessRequestService = {
  /**
   * Submit an access request, evaluate via OPA, and either auto-approve, route to pending, or deny
   */
  async createRequest({ user, profileId, requestedDurationMinutes, justification, req = null }) {
    if (!profileId || !justification) {
      throw new AppError('Profile ID and business justification are required', 400, 'BAD_REQUEST');
    }

    // 1. Fetch profile details
    const profile = await profileService.getProfile(profileId);

    // 2. Validate that user role is permitted to use this profile
    const permittedRoleNames = profile.roles.map(r => r.name);
    const userHasPermittedRole = user.roles.some(r => permittedRoleNames.includes(r) || r === 'admin');

    if (!userHasPermittedRole) {
      throw new AppError(
        `Role [${user.roles.join(', ')}] is not permitted to request profile '${profile.name}'`,
        403,
        'FORBIDDEN_PROFILE'
      );
    }

    const duration = requestedDurationMinutes || profile.max_duration_minutes || 60;

    // 3. Determine highest sensitivity
    const sensitivityRank = { low: 1, medium: 2, high: 3, critical: 4 };
    let highestSensitivity = 'low';
    for (const r of profile.resources) {
      if (sensitivityRank[r.sensitivity] > sensitivityRank[highestSensitivity]) {
        highestSensitivity = r.sensitivity;
      }
    }

    // Current time HH:MM format
    const now = new Date();
    const timeOfDay = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

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
        requires_approval: profile.requires_approval
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

    // 5. Evaluate policy in OPA
    const decision = await policyService.evaluateAccessRequest(opaInput);

    let requestStatus = 'pending';
    if (decision.action === 'allow') {
      requestStatus = 'approved';
    } else if (decision.action === 'deny') {
      requestStatus = 'denied';
    }

    // 6. Record request in database
    const [result] = await pool.execute(
      `INSERT INTO access_requests (user_id, profile_id, requested_duration_minutes, justification, status, decision_action, decision_reasons)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        profile.id,
        duration,
        justification,
        requestStatus,
        decision.action,
        JSON.stringify(decision.reasons || [])
      ]
    );

    const requestId = result.insertId;

    // Audit log
    await auditService.log({
      eventType: 'ACCESS_REQUEST_SUBMITTED',
      userId: user.id,
      username: user.username,
      status: requestStatus === 'denied' ? 'WARNING' : 'SUCCESS',
      details: { requestId, profileName: profile.name, decisionAction: decision.action },
      req
    });

    // 7. If Auto-Approved, provision MySQL user immediately
    if (requestStatus === 'approved') {
      const sessionResult = await sessionService.provisionSession({
        requestId,
        userId: user.id,
        profile,
        durationMinutes: duration
      });

      return {
        status: 'approved',
        requestId,
        decision,
        credentials: sessionResult.credentials
      };
    }

    // If pending or denied
    return {
      status: requestStatus,
      requestId,
      decision,
      message: requestStatus === 'pending'
        ? 'Request submitted to administrator approval queue.'
        : `Request denied by policy: ${decision.reasons?.join(', ')}`
    };
  },

  /**
   * List pending access requests for administrator review
   */
  async listPendingRequests() {
    const [rows] = await pool.query(
      `SELECT ar.id, ar.user_id, ar.profile_id, ar.requested_duration_minutes,
              ar.justification, ar.status, ar.decision_action, ar.decision_reasons,
              ar.created_at,
              u.username, u.full_name, u.email,
              p.name AS profile_name, p.risk_level, p.allowed_operations
       FROM access_requests ar
       JOIN users u ON ar.user_id = u.id
       JOIN access_profiles p ON ar.profile_id = p.id
       WHERE ar.status = 'pending'
       ORDER BY ar.created_at ASC`
    );

    return rows.map(r => ({
      ...r,
      allowed_operations: typeof r.allowed_operations === 'string' ? JSON.parse(r.allowed_operations) : r.allowed_operations,
      decision_reasons: typeof r.decision_reasons === 'string' ? JSON.parse(r.decision_reasons) : r.decision_reasons
    }));
  },

  /**
   * Admin approves pending request -> creates JIT session and temp MySQL user
   */
  async approveRequest(requestId, adminUser, comments = '') {
    const [reqRows] = await pool.execute(
      `SELECT id, user_id, profile_id, requested_duration_minutes, status
       FROM access_requests WHERE id = ? LIMIT 1`,
      [requestId]
    );

    if (reqRows.length === 0) {
      throw new AppError('Access request not found', 404, 'NOT_FOUND');
    }

    const accessReq = reqRows[0];
    if (accessReq.status !== 'pending') {
      throw new AppError(`Cannot approve request with status '${accessReq.status}'`, 400, 'BAD_REQUEST');
    }

    // 1. Update status
    await pool.execute(`UPDATE access_requests SET status = 'approved' WHERE id = ?`, [requestId]);

    // 2. Record approval
    await pool.execute(
      `INSERT INTO approvals (request_id, decided_by, decision, comments) VALUES (?, ?, 'approved', ?)`,
      [requestId, adminUser.id, comments]
    );

    // 3. Fetch profile and provision session
    const profile = await profileService.getProfile(accessReq.profile_id);
    const sessionResult = await sessionService.provisionSession({
      requestId,
      userId: accessReq.user_id,
      profile,
      durationMinutes: accessReq.requested_duration_minutes
    });

    await auditService.log({
      eventType: 'ACCESS_REQUEST_APPROVED',
      userId: accessReq.user_id,
      username: adminUser.username,
      status: 'SUCCESS',
      details: { requestId, approvedBy: adminUser.username, comments }
    });

    return {
      success: true,
      requestId,
      sessionId: sessionResult.sessionId,
      credentials: sessionResult.credentials
    };
  },

  /**
   * Admin denies pending request
   */
  async denyRequest(requestId, adminUser, comments = '') {
    const [reqRows] = await pool.execute(
      `SELECT id, user_id, status FROM access_requests WHERE id = ? LIMIT 1`,
      [requestId]
    );

    if (reqRows.length === 0) {
      throw new AppError('Access request not found', 404, 'NOT_FOUND');
    }

    const accessReq = reqRows[0];
    if (accessReq.status !== 'pending') {
      throw new AppError(`Cannot deny request with status '${accessReq.status}'`, 400, 'BAD_REQUEST');
    }

    await pool.execute(`UPDATE access_requests SET status = 'denied' WHERE id = ?`, [requestId]);

    await pool.execute(
      `INSERT INTO approvals (request_id, decided_by, decision, comments) VALUES (?, ?, 'denied', ?)`,
      [requestId, adminUser.id, comments]
    );

    await auditService.log({
      eventType: 'ACCESS_REQUEST_DENIED',
      userId: accessReq.user_id,
      username: adminUser.username,
      status: 'WARNING',
      details: { requestId, deniedBy: adminUser.username, comments }
    });

    return { success: true, requestId, message: 'Access request denied' };
  }
};
