// backend/tests/e2e.test.js
import request from 'supertest';
import mysql from 'mysql2/promise';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';
import { ingestorService } from '../src/services/ingestor.service.js';
import { riskEngineService } from '../src/services/riskEngine.service.js';

describe('Phase 10 End-to-End Pipeline Integration Test', () => {
  let devToken = '';
  let adminToken = '';
  let devUserId = null;
  let requestId = null;
  let sessionId = null;
  let jitCreds = null;
  let createdAlertId = null;

  beforeAll(async () => {
    // 1. Authenticate developer (authorized for HR Payroll profile with approval)
    const devLogin = await request(app)
      .post('/auth/login')
      .send({ username: 'developer', password: 'Password123!' });
    expect(devLogin.status).toBe(200);
    devToken = devLogin.body.data.accessToken;
    devUserId = devLogin.body.data.user.id;

    // 2. Authenticate admin
    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'Password123!' });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.accessToken;
  });

  afterAll(async () => {
    // Clean up active session if still open
    if (sessionId) {
      try {
        await request(app)
          .post(`/sessions/${sessionId}/revoke`)
          .set('Authorization', `Bearer ${adminToken}`);
      } catch (e) {
        // ignore
      }
    }
    await pool.end();
  });

  it('Step 1 -> 2: User requests profile requiring approval; OPA routes to pending queue', async () => {
    // Profile 5: Executive Payroll & Compensation (requires approval)
    const res = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        profile_id: 5,
        requested_duration_minutes: 30,
        justification: 'E2E full lifecycle integration test for Phase 10'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.decision.action).toBe('require_approval');
    expect(res.body.data.requestId).toBeDefined();

    requestId = res.body.data.requestId;
  });

  it('Step 3 -> 4: Admin reviews pending request and approves; Ephemeral MySQL user provisioned', async () => {
    // Review pending requests
    const pendingRes = await request(app)
      .get('/access-requests/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(pendingRes.status).toBe(200);
    const pendingList = pendingRes.body.data.requests;
    const req = pendingList.find(r => r.id === requestId);
    expect(req).toBeDefined();

    // Approve pending request
    const approveRes = await request(app)
      .post(`/access-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comments: 'Approved for automated e2e verification' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.data.sessionId).toBeDefined();
    expect(approveRes.body.data.credentials).toBeDefined();

    sessionId = approveRes.body.data.sessionId;
    jitCreds = approveRes.body.data.credentials;

    expect(jitCreds.username).toMatch(/^jit_\d+_[a-f0-9]+$/);
    expect(jitCreds.database).toBe(env.DB.TARGET_NAME);
  });

  it('Step 5: Connect as ephemeral JIT MySQL user and execute compliant, blocked, and unbounded queries', async () => {
    const conn = await mysql.createConnection({
      host: jitCreds.host,
      port: jitCreds.port,
      user: jitCreds.username,
      password: jitCreds.password,
      database: jitCreds.database
    });

    try {
      // 1. Compliant query with LIMIT
      await conn.query('SELECT employee_code, name, email FROM Employees LIMIT 2;');

      // 2. Blocked out-of-scope query on ungranted Customers table (MySQL pre-execution denial)
      let blockedError = null;
      try {
        await conn.query('SELECT customer_code FROM Customers LIMIT 1;');
      } catch (err) {
        blockedError = err;
      }
      expect(blockedError).not.toBeNull();
      expect(blockedError.code).toBe('ER_TABLEACCESS_DENIED_ERROR');

      // 3. Repeated blocked query to trigger rapid failed queries detector
      try {
        await conn.query('SELECT * FROM Products LIMIT 1;');
      } catch (err) {
        // expected blocked
      }

      // 4. Unbounded bulk reads (SELECT * without LIMIT or WHERE on Payroll)
      await conn.query('SELECT * FROM Payroll;');
      await conn.query('SELECT * FROM Employees;');
      await conn.query('SELECT employee_id, salary_amount, bonus_amount FROM Payroll;');
    } finally {
      await conn.end();
    }
  });

  it('Step 6 -> 7: Ingest general_log, attribute to JIT session, and evaluate policy violations in OPA', async () => {
    // Trigger polling ingestion cycle
    const count = await ingestorService.poll();
    expect(count).toBeGreaterThan(0);

    // Verify sql_events attribution
    const [events] = await pool.query(
      `SELECT * FROM sql_events WHERE session_id = ? ORDER BY id ASC`,
      [sessionId]
    );
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const evt of events) {
      expect(evt.session_id).toBe(sessionId);
      expect(evt.user_id).toBe(devUserId);
      expect(evt.mysql_username).toBe(jitCreds.username);
    }

    // Verify policy_violations: blocked_by_db and detected_post_hoc
    const [violations] = await pool.query(
      `SELECT * FROM policy_violations WHERE session_id = ? ORDER BY id ASC`,
      [sessionId]
    );
    expect(violations.length).toBeGreaterThanOrEqual(2);

    const blocked = violations.find(v => v.enforcement_type === 'blocked_by_db');
    expect(blocked).toBeDefined();
    expect(blocked.rule).toBe('TABLE_OUT_OF_SCOPE');

    const postHoc = violations.find(v => v.enforcement_type === 'detected_post_hoc');
    expect(postHoc).toBeDefined();
    expect(postHoc.rule).toBe('UNBOUNDED_BULK_READ');
  });

  it('Step 8 -> 9: Risk engine aggregates explainable score and raises security alert (score >= 70)', async () => {
    // Evaluate session risk
    const risk = await riskEngineService.evaluateSessionRisk(sessionId);
    expect(risk).not.toBeNull();
    expect(risk.score).toBeGreaterThanOrEqual(70);
    expect(['high', 'critical']).toContain(risk.risk_level);
    expect(risk.breakdown.length).toBeGreaterThan(0);

    // Verify risk score persistence
    const [scoreRows] = await pool.query(
      `SELECT * FROM session_risk_scores WHERE session_id = ? LIMIT 1`,
      [sessionId]
    );
    expect(scoreRows.length).toBe(1);
    expect(scoreRows[0].score).toBe(risk.score);

    // Verify alert generated
    const [alertRows] = await pool.query(
      `SELECT * FROM alerts WHERE session_id = ? LIMIT 1`,
      [sessionId]
    );
    expect(alertRows.length).toBe(1);
    expect(alertRows[0].status).toBe('open');
    expect(alertRows[0].risk_score).toBe(risk.score);
    expect(alertRows[0].evidence).toBeDefined();

    createdAlertId = alertRows[0].id;
  });

  it('Step 10: Admin queries /alerts and updates status to investigating', async () => {
    const listRes = await request(app)
      .get(`/alerts?session_id=${sessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.alerts.length).toBeGreaterThanOrEqual(1);

    const alert = listRes.body.data.alerts.find(a => a.id === createdAlertId);
    expect(alert).toBeDefined();

    // Transition status to 'investigating'
    const patchRes = await request(app)
      .patch(`/alerts/${createdAlertId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'investigating',
        notes: 'Under investigation by security team. Quarantining session.'
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.status).toBe('investigating');
    expect(patchRes.body.data.notes).toContain('Quarantining session');
  });

  it('Step 11: Admin revokes JIT session -> MySQL user is dropped and connection is terminated', async () => {
    const revokeRes = await request(app)
      .post(`/sessions/${sessionId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.success).toBe(true);

    // Verify session status updated
    const [sessRows] = await pool.query(
      `SELECT status FROM db_sessions WHERE id = ? LIMIT 1`,
      [sessionId]
    );
    expect(sessRows[0].status).toBe('revoked');

    // Verify MySQL ephemeral user was dropped from database engine
    let reconnected = false;
    try {
      const conn = await mysql.createConnection({
        host: jitCreds.host,
        port: jitCreds.port,
        user: jitCreds.username,
        password: jitCreds.password,
        database: jitCreds.database
      });
      await conn.end();
      reconnected = true;
    } catch (err) {
      expect(err.code).toMatch(/ER_ACCESS_DENIED_ERROR|ECONNREFUSED/);
    }
    expect(reconnected).toBe(false);
  });
});
