// backend/tests/violations.test.js
import request from 'supertest';
import mysql from 'mysql2/promise';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';
import { ingestorService } from '../src/services/ingestor.service.js';
import { violationService } from '../src/services/violation.service.js';

describe('Phase 7 Policy Evaluation of Observed Queries Tests', () => {
  let adminToken = '';
  let devToken = '';
  let jitCreds = null;
  let jitSessionId = null;

  beforeAll(async () => {
    // 1. Authenticate admin
    const adminRes = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'Password123!' });
    adminToken = adminRes.body.data.accessToken;

    // 2. Authenticate developer
    const devRes = await request(app)
      .post('/auth/login')
      .send({ username: 'developer', password: 'Password123!' });
    devToken = devRes.body.data.accessToken;

    // 3. Find "Developer Read Profile"
    const [profiles] = await pool.query(
      `SELECT id, name FROM access_profiles WHERE name = 'Developer Read Profile' LIMIT 1`
    );
    const profileId = profiles[0].id;

    // 4. Request JIT session (auto-approved)
    const reqRes = await request(app)
      .post('/access-requests')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        profile_id: profileId,
        requested_duration_minutes: 30,
        justification: 'Automated test for Phase 7 policy evaluation'
      });

    expect(reqRes.status).toBe(201);
    jitCreds = reqRes.body.data.credentials;

    const [rows] = await pool.query(
      `SELECT id FROM db_sessions WHERE mysql_username = ? LIMIT 1`,
      [jitCreds.username]
    );
    expect(rows.length).toBe(1);
    jitSessionId = rows[0].id;
  });

  afterAll(async () => {
    // Revoke and clean up temporary JIT user
    if (jitSessionId) {
      await request(app)
        .post(`/sessions/${jitSessionId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    await pool.end();
  });

  it('allows compliant query without generating violations', async () => {
    const conn = await mysql.createConnection({
      host: env.DB.HOST,
      port: env.DB.PORT,
      user: jitCreds.username,
      password: jitCreds.password,
      database: env.DB.TARGET_NAME
    });

    try {
      // Execute compliant query with LIMIT
      await conn.query('SELECT customer_code, name FROM Customers WHERE customer_category = "enterprise" LIMIT 2;');
    } finally {
      await conn.end();
    }

    // Run poller
    await ingestorService.poll();

    // Verify no violations for this specific compliant query
    const violations = await violationService.listViolations({ sessionId: jitSessionId });
    const compliantViolations = violations.filter(v => v.raw_sql.includes('customer_category = "enterprise"'));
    expect(compliantViolations.length).toBe(0);
  });

  it('records blocked_by_db violation when querying out-of-scope table', async () => {
    const conn = await mysql.createConnection({
      host: env.DB.HOST,
      port: env.DB.PORT,
      user: jitCreds.username,
      password: jitCreds.password,
      database: env.DB.TARGET_NAME
    });

    let dbError = null;
    try {
      // Attempt query against ungranted Payroll table
      await conn.query('SELECT salary_amount FROM Payroll LIMIT 1;');
    } catch (err) {
      dbError = err;
    } finally {
      await conn.end();
    }

    // Verify MySQL blocked execution pre-emptively
    expect(dbError).not.toBeNull();
    expect(dbError.code).toBe('ER_TABLEACCESS_DENIED_ERROR');

    // Run poller
    await ingestorService.poll();

    // Verify violation recorded in policy_violations
    const violations = await violationService.listViolations({ sessionId: jitSessionId, rule: 'TABLE_OUT_OF_SCOPE' });
    expect(violations.length).toBeGreaterThanOrEqual(1);

    const match = violations.find(v => v.raw_sql.toLowerCase().includes('payroll'));
    expect(match).toBeDefined();
    expect(match.severity).toBe('high');
    expect(match.enforcement_type).toBe('blocked_by_db');
  });

  it('records blocked_by_db violation when attempting ungranted DELETE operation', async () => {
    const conn = await mysql.createConnection({
      host: env.DB.HOST,
      port: env.DB.PORT,
      user: jitCreds.username,
      password: jitCreds.password,
      database: env.DB.TARGET_NAME
    });

    let dbError = null;
    try {
      // Attempt ungranted DELETE on Customers table
      await conn.query('DELETE FROM Customers WHERE id = 99999;');
    } catch (err) {
      dbError = err;
    } finally {
      await conn.end();
    }

    // Verify MySQL blocked execution pre-emptively
    expect(dbError).not.toBeNull();
    expect(dbError.code).toBe('ER_TABLEACCESS_DENIED_ERROR');

    // Run poller
    await ingestorService.poll();

    // Verify violation recorded in policy_violations
    const violations = await violationService.listViolations({ sessionId: jitSessionId, rule: 'OPERATION_NOT_GRANTED' });
    expect(violations.length).toBeGreaterThanOrEqual(1);

    const match = violations.find(v => v.raw_sql.toUpperCase().includes('DELETE FROM CUSTOMERS'));
    expect(match).toBeDefined();
    expect(match.severity).toBe('high');
    expect(match.enforcement_type).toBe('blocked_by_db');
  });

  it('records detected_post_hoc violation when executing unbounded bulk SELECT *', async () => {
    const conn = await mysql.createConnection({
      host: env.DB.HOST,
      port: env.DB.PORT,
      user: jitCreds.username,
      password: jitCreds.password,
      database: env.DB.TARGET_NAME
    });

    let result = null;
    try {
      // Execute unbounded SELECT * on granted Orders table (succeeds at DB level)
      [result] = await conn.query('SELECT * FROM Orders;');
    } finally {
      await conn.end();
    }

    expect(result.length).toBeGreaterThan(0);

    // Run poller
    await ingestorService.poll();

    // Verify violation detected post-hoc from audit telemetry
    const violations = await violationService.listViolations({ sessionId: jitSessionId, rule: 'UNBOUNDED_BULK_READ' });
    expect(violations.length).toBeGreaterThanOrEqual(1);

    const match = violations.find(v => v.raw_sql.toUpperCase().includes('SELECT * FROM ORDERS'));
    expect(match).toBeDefined();
    expect(match.severity).toBe('medium');
    expect(match.enforcement_type).toBe('detected_post_hoc');
  });

  it('filters violations by enforcement_type via GET /violations', async () => {
    const resBlocked = await request(app)
      .get('/violations?enforcement_type=blocked_by_db')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resBlocked.status).toBe(200);
    expect(resBlocked.body.success).toBe(true);
    expect(resBlocked.body.data.violations.length).toBeGreaterThanOrEqual(1);
    expect(resBlocked.body.data.violations.every(v => v.enforcement_type === 'blocked_by_db')).toBe(true);

    const resPostHoc = await request(app)
      .get('/violations?enforcement_type=detected_post_hoc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resPostHoc.status).toBe(200);
    expect(resPostHoc.body.success).toBe(true);
    expect(resPostHoc.body.data.violations.length).toBeGreaterThanOrEqual(1);
    expect(resPostHoc.body.data.violations.every(v => v.enforcement_type === 'detected_post_hoc')).toBe(true);
  });

  it('denies access to /violations for unauthorized employee roles', async () => {
    const res = await request(app)
      .get('/violations')
      .set('Authorization', `Bearer ${devToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
