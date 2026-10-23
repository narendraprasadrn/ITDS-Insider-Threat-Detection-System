// backend/tests/architectureAudit.test.js
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { ingestorService } from '../src/services/ingestor.service.js';

describe('ITDS Architecture Audit: 12-Scenario Verification Suite', () => {
  let adminToken = '';
  let dbaToken = '';
  let devToken = '';

  let adminSessionId = null;
  let dbaSessionId = null;
  let devSessionId = null;

  beforeAll(async () => {
    // 1. Authenticate Admin
    const adminRes = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'Password123!' });
    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.data.accessToken;

    // 2. Authenticate DBA
    const dbaRes = await request(app)
      .post('/auth/login')
      .send({ username: 'dba', password: 'Password123!' });
    expect(dbaRes.status).toBe(200);
    dbaToken = dbaRes.body.data.accessToken;

    // 3. Authenticate Developer
    const devRes = await request(app)
      .post('/auth/login')
      .send({ username: 'developer', password: 'Password123!' });
    expect(devRes.status).toBe(200);
    devToken = devRes.body.data.accessToken;
  });

  afterAll(async () => {
    // Teardown active test sessions
    if (adminSessionId) {
      await request(app)
        .post(`/sessions/${adminSessionId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    if (dbaSessionId) {
      await request(app)
        .post(`/sessions/${dbaSessionId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    if (devSessionId) {
      await request(app)
        .post(`/sessions/${devSessionId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    await pool.end();
  });

  // -------------------------------------------------------------------------
  // SCENARIO 1: Developer compliant bounded read executes successfully
  // -------------------------------------------------------------------------
  test('Scenario 1: Developer compliant bounded read executes with ALLOWED outcome using JIT credentials', async () => {
    // Developer requests routine Developer Read Profile (Profile 1)
    const reqRes = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        profile_id: 1,
        requested_duration_minutes: 60,
        justification: 'Scenario 1 test: routine developer query execution'
      });

    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.status).toBe('approved');
    devSessionId = reqRes.body.data.sessionId;
    expect(devSessionId).toBeDefined();

    // Verify session in db has ephemeral mysql_password
    const [sessRows] = await pool.query(
      'SELECT id, mysql_username, mysql_password, status FROM db_sessions WHERE id = ?',
      [devSessionId]
    );
    expect(sessRows[0].status).toBe('active');
    expect(sessRows[0].mysql_password).toBeTruthy();

    // Execute compliant bounded SELECT
    const execRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: devSessionId,
        sql: "SELECT customer_code, name FROM Customers WHERE customer_category = 'enterprise' LIMIT 3;"
      });

    expect(execRes.status).toBe(200);
    expect(execRes.body.success).toBe(true);
    expect(execRes.body.data.outcome).toBe('ALLOWED');
    expect(execRes.body.data.blocked).toBe(false);
    expect(Array.isArray(execRes.body.data.rows)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 2: Developer unauthorized table is rejected pre-execution
  // -------------------------------------------------------------------------
  test('Scenario 2: Developer accessing unauthorized table (Payroll) is rejected pre-execution with TABLE_OUT_OF_SCOPE', async () => {
    const execRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: devSessionId,
        sql: 'SELECT * FROM Payroll;'
      });

    expect(execRes.status).toBe(403);
    expect(execRes.body.success).toBe(false);
    expect(execRes.body.data.blocked).toBe(true);
    expect(execRes.body.data.outcome).toBe('DENIED');
    expect(execRes.body.data.policyDecision.violations).toContain('TABLE_OUT_OF_SCOPE');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 3: Developer unauthorized operation (DELETE/DROP) is rejected pre-execution
  // -------------------------------------------------------------------------
  test('Scenario 3: Developer unauthorized operations (DELETE/DROP) are rejected pre-execution with OPERATION_NOT_GRANTED / UNAUTHORIZED_DDL', async () => {
    // 3a. Unauthorized DELETE
    const delRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: devSessionId,
        sql: 'DELETE FROM Customers WHERE id = 99999;'
      });

    expect(delRes.status).toBe(403);
    expect(delRes.body.data.blocked).toBe(true);
    expect(delRes.body.data.outcome).toBe('DENIED');
    expect(delRes.body.data.policyDecision.violations).toContain('OPERATION_NOT_GRANTED');

    // 3b. Unauthorized DDL
    const ddlRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: devSessionId,
        sql: 'DROP TABLE Products;'
      });

    expect(ddlRes.status).toBe(403);
    expect(ddlRes.body.data.blocked).toBe(true);
    expect(ddlRes.body.data.outcome).toBe('DENIED');
    expect(ddlRes.body.data.policyDecision.violations).toContain('UNAUTHORIZED_DDL');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 4: Admin SQL Workspace profile options
  // -------------------------------------------------------------------------
  test('Scenario 4: Admin receives Admin profile options and defaults to Admin Security Administration, NOT Developer Read Profile', async () => {
    const profRes = await request(app)
      .get('/profiles/available')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(profRes.status).toBe(200);
    const profiles = profRes.body.data.profiles;
    expect(profiles.length).toBeGreaterThan(0);

    // Profile 7 (Admin Security Administration) should be the first/default profile
    expect(profiles[0].id).toBe(7);
    expect(profiles[0].name).toBe('Admin Security Administration');

    // Profile 1 (Developer Read Profile) should NOT be available to Admin
    const devProfile = profiles.find(p => p.id === 1);
    expect(devProfile).toBeUndefined();

    // Admin activates routine Admin Security Administration profile
    const reqRes = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        profile_id: 7,
        requested_duration_minutes: 60,
        justification: 'Scenario 4 test: routine admin access'
      });

    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.status).toBe('approved');
    adminSessionId = reqRes.body.data.sessionId;
    expect(adminSessionId).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // SCENARIO 5: Admin executes administrative read/update queries across permitted tables
  // -------------------------------------------------------------------------
  test('Scenario 5: Admin executes administrative queries across permitted tables with proper attribution', async () => {
    // Admin reads SecurityAuditLogs
    const execRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: adminSessionId,
        sql: 'SELECT id, event_type, resource FROM SecurityAuditLogs LIMIT 5;'
      });

    expect(execRes.status).toBe(200);
    expect(execRes.body.success).toBe(true);
    expect(execRes.body.data.outcome).toBe('ALLOWED');

    // Verify audit record attribution in sql_events
    const [auditRows] = await pool.query(
      'SELECT se.id, se.user_id, u.username FROM sql_events se JOIN users u ON se.user_id = u.id WHERE se.id = ?',
      [execRes.body.data.eventId]
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].username).toBe('admin');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 6: Admin attempting destructive DDL is blocked pre-execution
  // -------------------------------------------------------------------------
  test('Scenario 6: Admin attempting destructive DDL without explicit DDL grant is blocked pre-execution', async () => {
    const ddlRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: adminSessionId,
        sql: 'DROP TABLE Customers;'
      });

    expect(ddlRes.status).toBe(403);
    expect(ddlRes.body.data.blocked).toBe(true);
    expect(ddlRes.body.data.outcome).toBe('DENIED');
    expect(ddlRes.body.data.policyDecision.violations).toContain('UNAUTHORIZED_DDL');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 7: DBA routine profile auto-approves vs maintenance profile requiring approval
  // -------------------------------------------------------------------------
  test('Scenario 7: DBA routine operations auto-approves; DBA Maintenance Profile requires approval', async () => {
    // 7a. Routine DBA Operations Profile (Profile 3) auto-approves
    const dbaOpsRes = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${dbaToken}`)
      .send({
        profile_id: 3,
        requested_duration_minutes: 60,
        justification: 'Scenario 7 test: DBA routine ops'
      });

    expect(dbaOpsRes.status).toBe(201);
    expect(dbaOpsRes.body.data.status).toBe('approved');
    dbaSessionId = dbaOpsRes.body.data.sessionId;

    // 7b. Elevated DBA Maintenance Profile (Profile 4, has DDL) requires approval
    const dbaMaintRes = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${dbaToken}`)
      .send({
        profile_id: 4,
        requested_duration_minutes: 60,
        justification: 'Scenario 7 test: DBA maintenance with DDL requires supervisor approval'
      });

    expect(dbaMaintRes.status).toBe(200);
    expect(dbaMaintRes.body.data.status).toBe('pending');
    expect(dbaMaintRes.body.data.sessionId).toBeUndefined();

    // Admin approves the request
    const requestId = dbaMaintRes.body.data.requestId;
    const approveRes = await request(app)
      .post(`/access-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.success).toBe(true);
    expect(approveRes.body.data.sessionId).toBeDefined();

    // Cleanup maintenance session
    await request(app)
      .post(`/sessions/${approveRes.body.data.sessionId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 8: Expired/revoked session is blocked from execution
  // -------------------------------------------------------------------------
  test('Scenario 8: Expired or revoked session is blocked from execution and credentials cleared', async () => {
    // Admin revokes Developer session
    const revRes = await request(app)
      .post(`/sessions/${devSessionId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revRes.status).toBe(200);

    // Verify in MySQL that status is revoked and mysql_password is cleared
    const [sessRows] = await pool.query(
      'SELECT id, status, mysql_password FROM db_sessions WHERE id = ?',
      [devSessionId]
    );
    expect(sessRows[0].status).toBe('revoked');
    expect(sessRows[0].mysql_password).toBeNull();

    // Attempting query execution on revoked session must be rejected
    const execRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: devSessionId,
        sql: 'SELECT count(*) FROM Customers;'
      });

    expect(execRes.status).toBe(403);
    expect(execRes.body.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 9: Cross-user session execution is strictly blocked
  // -------------------------------------------------------------------------
  test('Scenario 9: Cross-user session execution is blocked (Developer cannot execute against Admin session)', async () => {
    const crossRes = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        session_id: adminSessionId,
        sql: 'SELECT * FROM Customers LIMIT 1;'
      });

    expect(crossRes.status).toBe(403);
    expect(crossRes.body.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 10: Ingestion deduplication across repeated poll cycles
  // -------------------------------------------------------------------------
  test('Scenario 10: Repeated ingestion cycles on the same general_log entries do NOT produce duplicate events', async () => {
    // Run first poll
    await ingestorService.poll();

    const [eventsBefore] = await pool.query('SELECT COUNT(*) as cnt FROM sql_events');
    const [violationsBefore] = await pool.query('SELECT COUNT(*) as cnt FROM policy_violations');

    // Run second poll immediately (idempotent)
    const newCount = await ingestorService.poll();
    expect(newCount).toBe(0);

    const [eventsAfter] = await pool.query('SELECT COUNT(*) as cnt FROM sql_events');
    const [violationsAfter] = await pool.query('SELECT COUNT(*) as cnt FROM policy_violations');

    expect(eventsAfter[0].cnt).toBe(eventsBefore[0].cnt);
    expect(violationsAfter[0].cnt).toBe(violationsBefore[0].cnt);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 11: Security Monitoring dashboard polling remains idempotent
  // -------------------------------------------------------------------------
  test('Scenario 11: Security Monitoring metrics remain constant under repeated polling when no events occur', async () => {
    const alerts1 = await request(app)
      .get('/alerts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(alerts1.status).toBe(200);

    const viols1 = await request(app)
      .get('/violations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(viols1.status).toBe(200);

    const alerts2 = await request(app)
      .get('/alerts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(alerts2.status).toBe(200);

    const viols2 = await request(app)
      .get('/violations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(viols2.status).toBe(200);

    expect(alerts1.body.data.alerts.length).toBe(alerts2.body.data.alerts.length);
    expect(viols1.body.data.violations.length).toBe(viols2.body.data.violations.length);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 12: Ingestion recognizes workspace execution and avoids duplication
  // -------------------------------------------------------------------------
  test('Scenario 12: Ingestion recognizes queries executed via SQL workspace and links them without duplicate events', async () => {
    // DBA executes an operational query
    const dbaExec = await request(app)
      .post('/workspace/execute')
      .set('Authorization', `Bearer ${dbaToken}`)
      .send({
        session_id: dbaSessionId,
        sql: 'SELECT count(*) as total_orders FROM Orders;'
      });

    expect(dbaExec.status).toBe(200);
    const initialEventId = dbaExec.body.data.eventId;

    // Run ingestion polling cycle
    await ingestorService.poll();

    // Check that no second sql_event was created for this execution
    const [matches] = await pool.query(
      'SELECT id, source_log_id FROM sql_events WHERE session_id = ? AND raw_sql LIKE ?',
      [dbaSessionId, '%total_orders%']
    );
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe(initialEventId);
  });
});
