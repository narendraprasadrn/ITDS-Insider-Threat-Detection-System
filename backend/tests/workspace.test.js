// backend/tests/workspace.test.js
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { sessionService } from '../src/services/session.service.js';

describe('Phase 11 In-App Workspace & Persistent Request Lifecycle Integration Tests', () => {
  let adminToken = '';
  let dbaToken = '';
  let devToken = '';
  let devUser = null;
  let adminUser = null;

  let autoApprovedRequestId = null;
  let autoApprovedSessionId = null;
  let pendingRequestId = null;
  let pendingSessionId = null;

  beforeAll(async () => {
    // 1. Authenticate admin
    const adminRes = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'Password123!' });
    adminToken = adminRes.body.data.accessToken;
    adminUser = adminRes.body.data.user;

    // 2. Authenticate dba
    const dbaRes = await request(app)
      .post('/auth/login')
      .send({ username: 'dba', password: 'Password123!' });
    dbaToken = dbaRes.body.data.accessToken;

    // 3. Authenticate developer
    const devRes = await request(app)
      .post('/auth/login')
      .send({ username: 'developer', password: 'Password123!' });
    devToken = devRes.body.data.accessToken;
    devUser = devRes.body.data.user;
  });

  afterAll(async () => {
    // Teardown any test sessions
    if (autoApprovedSessionId) {
      await request(app)
        .post(`/sessions/${autoApprovedSessionId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    if (pendingSessionId) {
      await request(app)
        .post(`/sessions/${pendingSessionId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    await pool.end();
  });

  // Requirement 1 & 4: Developer submits access request -> OPA allows eligible request
  it('1 & 4. Developer submits an eligible access request and OPA auto-allows it', async () => {
    const res = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        profile_id: 1, // Developer Read Profile
        requested_duration_minutes: 45,
        time_of_day: '10:00',
        justification: 'Automated workspace test: standard development reading'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.decision.action).toBe('allow');
    expect(['approved', 'active']).toContain(res.body.data.status);
    expect(res.body.data.sessionId).toBeDefined();

    autoApprovedRequestId = res.body.data.requestId;
    autoApprovedSessionId = res.body.data.sessionId;
  });

  // Requirement 2: The request appears in the persisted database
  it('2. The access request appears in the persisted database with full state', async () => {
    const [rows] = await pool.query(
      `SELECT id, user_id, profile_id, status, session_id, decision_action
       FROM access_requests WHERE id = ? LIMIT 1`,
      [autoApprovedRequestId]
    );

    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('active');
    expect(rows[0].session_id).toBe(autoApprovedSessionId);
    expect(rows[0].decision_action).toBe('allow');
  });

  // Requirement 3: Admin and DBA can see the request according to permissions
  it('3. Admin and DBA can query and view the persisted request', async () => {
    // Admin checks access requests
    const adminRes = await request(app)
      .get(`/access-requests/${autoApprovedRequestId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.request.id).toBe(autoApprovedRequestId);
    expect(adminRes.body.data.request.username).toBe('developer');

    // DBA checks access requests
    const dbaRes = await request(app)
      .get(`/access-requests/${autoApprovedRequestId}`)
      .set('Authorization', `Bearer ${dbaToken}`);

    expect(dbaRes.status).toBe(200);
    expect(dbaRes.body.data.request.id).toBe(autoApprovedRequestId);
  });

  // Requirement 5: OPA denies an unauthorized request
  it('5. OPA denies an unauthorized request (developer requesting DBA Maintenance profile)', async () => {
    const res = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        profile_id: 4, // DBA Maintenance Profile (not assigned to Developer role)
        requested_duration_minutes: 60,
        justification: 'Attempting unauthorized profile request'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // Requirement 6: Approval-required requests remain pending until approved
  it('6. Approval-required requests remain in pending state', async () => {
    const res = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${dbaToken}`)
      .send({
        profile_id: 4, // DBA Maintenance Profile (requires_approval: true)
        requested_duration_minutes: 30,
        time_of_day: '10:00',
        justification: 'Quarterly maintenance review'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.decision.action).toBe('require_approval');

    pendingRequestId = res.body.data.requestId;

    // Verify it is visible in pending queue
    const pendRes = await request(app)
      .get('/access-requests/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(pendRes.status).toBe(200);
    const found = pendRes.body.data.requests.find(r => r.id === pendingRequestId);
    expect(found).toBeDefined();
  });

  // Requirement 7: Session creation follows successful authorization and required approval
  it('7. Session creation follows successful administrator approval', async () => {
    const approveRes = await request(app)
      .post(`/access-requests/${pendingRequestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comments: 'Approved by security test' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.data.sessionId).toBeDefined();

    pendingSessionId = approveRes.body.data.sessionId;

    // Verify request transitioned to active
    const [rows] = await pool.query(
      `SELECT status, session_id, approved_by FROM access_requests WHERE id = ?`,
      [pendingRequestId]
    );
    expect(rows[0].status).toBe('active');
    expect(rows[0].session_id).toBe(pendingSessionId);
  });

  // Requirement 8: Active session appears in Developer, DBA, and Admin views
  it('8. Active session appears in Developer, DBA, and Admin session listings', async () => {
    // Developer views own sessions
    const devRes = await request(app)
      .get('/sessions/my')
      .set('Authorization', `Bearer ${devToken}`);

    expect(devRes.status).toBe(200);
    const devHasSession = devRes.body.data.sessions.some(s => s.id === autoApprovedSessionId);
    expect(devHasSession).toBe(true);

    // DBA views active sessions
    const dbaRes = await request(app)
      .get('/sessions/active')
      .set('Authorization', `Bearer ${dbaToken}`);

    expect(dbaRes.status).toBe(200);
    expect(dbaRes.body.data.sessions.some(s => s.id === autoApprovedSessionId)).toBe(true);

    // Admin views all sessions via canonical /sessions
    const adminRes = await request(app)
      .get('/sessions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.sessions.some(s => s.id === autoApprovedSessionId)).toBe(true);
  });

  // Requirement 9: Allowed SQL query executes through in-app workspace
  it('9. Allowed SQL query executes cleanly through the in-app workspace', async () => {
    const res = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: autoApprovedSessionId,
        sql: "SELECT customer_code, name, customer_category FROM Customers WHERE customer_category = 'enterprise' LIMIT 3;"
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.blocked).toBe(false);
    expect(res.body.data.columns).toContain('customer_code');
    expect(res.body.data.rows.length).toBeGreaterThan(0);
    expect(res.body.data.executionTimeMs).toBeDefined();
    expect(res.body.data.policyDecision.allow).toBe(true);
  });

  // Requirement 10: Prohibited query is blocked pre-execution at enforcement boundary
  it('10. Prohibited query (unauthorized Payroll table) is blocked PRE-EXECUTION by policy', async () => {
    const res = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: autoApprovedSessionId,
        sql: 'SELECT salary_amount, payment_status FROM Payroll LIMIT 5;'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.data.blocked).toBe(true);
    expect(res.body.data.policyDecision.allow).toBe(false);
    expect(res.body.data.policyDecision.violations).toContain('TABLE_OUT_OF_SCOPE');

    // Verify violation recorded as blocked_pre_execution in policy_violations
    const [violRows] = await pool.query(
      `SELECT rule, enforcement_type FROM policy_violations WHERE session_id = ? AND rule = 'TABLE_OUT_OF_SCOPE' ORDER BY id DESC LIMIT 1`,
      [autoApprovedSessionId]
    );
    expect(violRows.length).toBe(1);
    expect(violRows[0].enforcement_type).toBe('blocked_pre_execution');
  });

  // Requirement 11: Query results and activity records appear in correct views
  it('11. Query results and activity records appear in workspace history and SQL activity log', async () => {
    const histRes = await request(app)
      .get(`/workspace/history/${autoApprovedSessionId}`)
      .set('Authorization', `Bearer ${devToken}`);

    expect(histRes.status).toBe(200);
    expect(histRes.body.data.history.length).toBeGreaterThanOrEqual(2);

    // Verify SQL events viewable by admin/dba
    const eventsRes = await request(app)
      .get(`/sql-events?session_id=${autoApprovedSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.data.events.length).toBeGreaterThanOrEqual(2);
  });

  // Requirement 12: Expired and revoked sessions cannot execute further queries
  it('12. Revoked session is denied further query execution', async () => {
    // Revoke the session
    const revRes = await request(app)
      .post(`/sessions/${autoApprovedSessionId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(revRes.status).toBe(200);

    // Attempt execution with revoked session
    const execRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: autoApprovedSessionId,
        sql: 'SELECT customer_code FROM Customers LIMIT 1;'
      });

    expect(execRes.status).toBe(403);
    expect(execRes.body.success).toBe(false);
    expect(execRes.body.data?.blocked === true || execRes.body.error?.code === 'SESSION_INACTIVE').toBe(true);
  });

  // Requirement 13: SQL activity is associated with correct user and session
  it('13. Ingested/workspace SQL events are attributed to verified session and user', async () => {
    const [rows] = await pool.query(
      `SELECT session_id, user_id, mysql_username, status
       FROM sql_events WHERE session_id = ? LIMIT 1`,
      [autoApprovedSessionId]
    );

    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(devUser.id);
    expect(rows[0].session_id).toBe(autoApprovedSessionId);
    expect(rows[0].status).toMatch(/attributed|blocked/);
  });

  // Requirement 14: Risk events and alerts contain real supporting evidence
  it('14. Risk events and alerts contain real session evidence', async () => {
    const res = await request(app)
      .get(`/risk-scores/${autoApprovedSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.risk_score).toBeDefined();
    expect(res.body.data.risk_score.breakdown).toBeDefined();
  });

  // Requirement 15: Unauthorized users cannot access another user's requests, sessions, or results
  it("15. Developer cannot view or execute queries against another user's session", async () => {
    // Attempt execution using pendingSessionId (belongs to admin) as developer
    const res = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: pendingSessionId,
        sql: 'SELECT customer_code FROM Customers LIMIT 1;'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN_SESSION');

    // Attempt accessing another user's request details
    const reqRes = await request(app)
      .get(`/access-requests/${pendingRequestId}`)
      .set('Authorization', `Bearer ${devToken}`);

    expect(reqRes.status).toBe(403);
    expect(reqRes.body.success).toBe(false);
  });

  // Requirement 16 & 17: Non-blocking behavioural review with canonical event ID tracing
  it('16 & 17. Unbounded read is BLOCKED PRE-EXECUTION and yields canonical eventId in sql_events and policy_violations', async () => {
    // Create an active session for developer
    const reqRes = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        profile_id: 1, // Developer Read Profile
        requested_duration_minutes: 30,
        time_of_day: '10:00',
        justification: 'Testing canonical event ID tracing for pre-execution block'
      });

    expect(reqRes.status).toBe(201);
    const traceSessionId = reqRes.body.data.sessionId;

    // Execute unbounded read: SELECT * FROM Customers; (must be blocked pre-execution)
    const execRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: traceSessionId,
        sql: 'SELECT * FROM Customers;'
      });

    expect(execRes.status).toBe(403);
    expect(execRes.body.success).toBe(false);
    expect(execRes.body.data.blocked).toBe(true);
    expect(execRes.body.data.outcome).toBe('BLOCKED PRE-EXECUTION');
    expect(execRes.body.data.rule).toBe('UNBOUNDED_BULK_READ');
    expect(execRes.body.data.rowCount).toBe(0);
    expect(execRes.body.data.rows.length).toBe(0);
    expect(execRes.body.data.eventId).toBeDefined();

    const canonicalEventId = execRes.body.data.eventId;

    // Verify canonical event in sql_events with status 'blocked'
    const [eventRows] = await pool.query(
      `SELECT id, session_id, user_id, raw_sql, operation, status FROM sql_events WHERE id = ?`,
      [canonicalEventId]
    );
    expect(eventRows.length).toBe(1);
    expect(eventRows[0].id).toBe(canonicalEventId);
    expect(eventRows[0].session_id).toBe(traceSessionId);
    expect(eventRows[0].user_id).toBe(devUser.id);
    expect(eventRows[0].status).toBe('blocked');

    // Verify canonical event in policy_violations with enforcement_type 'blocked_pre_execution'
    const [violRows] = await pool.query(
      `SELECT id, event_id, session_id, user_id, rule, severity, enforcement_type FROM policy_violations WHERE event_id = ?`,
      [canonicalEventId]
    );
    expect(violRows.length).toBeGreaterThanOrEqual(1);
    expect(violRows[0].event_id).toBe(canonicalEventId);
    expect(violRows[0].rule).toBe('UNBOUNDED_BULK_READ');
    expect(violRows[0].enforcement_type).toBe('blocked_pre_execution');

    // 18. DBA view verifies the exact same persisted event records
    const dbaEventsRes = await request(app)
      .get('/sql-events?limit=10')
      .set('Authorization', `Bearer ${dbaToken}`);
    expect(dbaEventsRes.status).toBe(200);
    const dbaEventFound = dbaEventsRes.body.data.events.some(e => e.id === canonicalEventId);
    expect(dbaEventFound).toBe(true);

    const dbaViolsRes = await request(app)
      .get(`/violations?session_id=${traceSessionId}`)
      .set('Authorization', `Bearer ${dbaToken}`);
    expect(dbaViolsRes.status).toBe(200);
    const dbaViolFound = dbaViolsRes.body.data.violations.some(v => v.event_id === canonicalEventId);
    expect(dbaViolFound).toBe(true);

    // 19. Admin view verifies the exact same persisted event records
    const adminViolsRes = await request(app)
      .get(`/violations?session_id=${traceSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminViolsRes.status).toBe(200);
    const adminViolFound = adminViolsRes.body.data.violations.some(v => v.event_id === canonicalEventId);
    expect(adminViolFound).toBe(true);

    // 20. Developer can access session violations via workspace route, but denied for other users
    const devViolRes = await request(app)
      .get(`/workspace/violations/${traceSessionId}`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(devViolRes.status).toBe(200);
    expect(devViolRes.body.success).toBe(true);
    expect(devViolRes.body.data.violations.some(v => v.event_id === canonicalEventId)).toBe(true);

    // Revoke trace session
    await request(app)
      .post(`/sessions/${traceSessionId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);
  });
});
