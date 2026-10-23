// backend/tests/roleAccess.test.js
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';

describe('Role Access Architecture: Independent Admin, DBA, Developer Tests', () => {
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

  // =========================================================================
  // 1. ADMIN ROLE TESTS
  // =========================================================================
  describe('Admin Role Access & Execution', () => {
    it('Admin receives Admin Security Administration as first/default profile', async () => {
      const res = await request(app)
        .get('/profiles/available')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.profiles.length).toBeGreaterThan(0);
      expect(res.body.data.profiles[0].id).toBe(7);
      expect(res.body.data.profiles[0].name).toBe('Admin Security Administration');
    });

    it('Admin activates routine Admin Security Administration profile without manual approval', async () => {
      const res = await request(app)
        .post('/access-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          profile_id: 7,
          requested_duration_minutes: 60,
          time_of_day: '10:00',
          justification: 'Routine administrative security monitoring and audit verification.'
        });

      expect(res.status).toBe(201);
      expect(['approved', 'active']).toContain(res.body.data.status);
      expect(res.body.data.session_status).toBe('active');
      expect(res.body.data.decision.action).toBe('allow');
      expect(res.body.data.sessionId).toBeDefined();

      adminSessionId = res.body.data.sessionId;
    });

    it('Admin executes queries across all business tables, including sensitive Payroll and Audit logs', async () => {
      // 1. Query Customers (unbounded read permitted for Admin)
      const custRes = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          session_id: adminSessionId,
          sql: 'SELECT * FROM Customers;'
        });
      expect(custRes.status).toBe(200);
      expect(custRes.body.data.outcome).toBe('ALLOWED');
      expect(custRes.body.data.rowCount).toBeGreaterThan(0);

      // 2. Query Payroll (Admin has authorized access to Payroll)
      const payRes = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          session_id: adminSessionId,
          sql: 'SELECT * FROM Payroll LIMIT 5;'
        });
      expect(payRes.status).toBe(200);
      expect(payRes.body.data.outcome).toBe('ALLOWED');

      // 3. Query SecurityAuditLogs
      const auditRes = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          session_id: adminSessionId,
          sql: 'SELECT * FROM SecurityAuditLogs LIMIT 5;'
        });
      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.outcome).toBe('ALLOWED');
    });

    it('Admin is blocked from unauthorized DDL if not in profile grants', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          session_id: adminSessionId,
          sql: 'DROP TABLE Customers;'
        });

      expect(res.status).toBe(403);
      expect(res.body.data.blocked).toBe(true);
      expect(['BLOCKED PRE-EXECUTION', 'DENIED']).toContain(res.body.data.outcome);
      expect(res.body.data.policyDecision.violations).toContain('UNAUTHORIZED_DDL');
    });

    it('Admin is blocked from cross-schema queries to system tables', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          session_id: adminSessionId,
          sql: 'SELECT * FROM Customers, mysql.user;'
        });

      expect(res.status).toBe(403);
      expect(res.body.data.blocked).toBe(true);
      expect(['BLOCKED PRE-EXECUTION', 'DENIED']).toContain(res.body.data.outcome);
      expect(res.body.data.policyDecision.violations).toContain('CROSS_SCHEMA_ACCESS');
    });
  });

  // =========================================================================
  // 2. DBA ROLE TESTS
  // =========================================================================
  describe('DBA Role Access & Execution', () => {
    it('DBA receives DBA Operations Profile as first/default profile', async () => {
      const res = await request(app)
        .get('/profiles/available')
        .set('Authorization', `Bearer ${dbaToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.profiles.length).toBeGreaterThan(0);
      expect(res.body.data.profiles[0].id).toBe(3);
      expect(res.body.data.profiles[0].name).toBe('DBA Operations Profile');
    });

    it('DBA activates routine DBA Operations Profile without manual approval', async () => {
      const res = await request(app)
        .post('/access-requests')
        .set('Authorization', `Bearer ${dbaToken}`)
        .send({
          profile_id: 3,
          requested_duration_minutes: 60,
          time_of_day: '10:00',
          justification: 'Routine database operations and index maintenance.'
        });

      expect(res.status).toBe(201);
      expect(['approved', 'active']).toContain(res.body.data.status);
      expect(res.body.data.session_status).toBe('active');
      expect(res.body.data.decision.action).toBe('allow');
      expect(res.body.data.sessionId).toBeDefined();

      dbaSessionId = res.body.data.sessionId;
    });

    it('DBA executes permitted queries on operational tables', async () => {
      // 1. Transactions
      const txRes = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${dbaToken}`)
        .send({
          session_id: dbaSessionId,
          sql: 'SELECT * FROM Transactions LIMIT 5;'
        });
      expect(txRes.status).toBe(200);
      expect(txRes.body.data.outcome).toBe('ALLOWED');

      // 2. BudgetReports
      const budgetRes = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${dbaToken}`)
        .send({
          session_id: dbaSessionId,
          sql: 'SELECT * FROM BudgetReports LIMIT 5;'
        });
      expect(budgetRes.status).toBe(200);
      expect(budgetRes.body.data.outcome).toBe('ALLOWED');

      // 3. Customers unbounded read is permitted under DBA Operations profile
      const custRes = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${dbaToken}`)
        .send({
          session_id: dbaSessionId,
          sql: 'SELECT * FROM Customers;'
        });
      expect(custRes.status).toBe(200);
      expect(custRes.body.data.outcome).toBe('ALLOWED');
    });

    it('DBA is blocked from out-of-scope Payroll table in routine DBA Operations Profile', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${dbaToken}`)
        .send({
          session_id: dbaSessionId,
          sql: 'SELECT * FROM Payroll LIMIT 5;'
        });

      expect(res.status).toBe(403);
      expect(res.body.data.blocked).toBe(true);
      expect(['BLOCKED PRE-EXECUTION', 'DENIED']).toContain(res.body.data.outcome);
      expect(res.body.data.policyDecision.violations).toContain('TABLE_OUT_OF_SCOPE');
    });

    it('DBA is blocked from DDL in routine DBA Operations Profile', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${dbaToken}`)
        .send({
          session_id: dbaSessionId,
          sql: 'DROP TABLE Orders;'
        });

      expect(res.status).toBe(403);
      expect(res.body.data.blocked).toBe(true);
      expect(['BLOCKED PRE-EXECUTION', 'DENIED']).toContain(res.body.data.outcome);
      expect(res.body.data.policyDecision.violations).toContain('UNAUTHORIZED_DDL');
    });

    it('DBA requesting DBA Maintenance Profile (with DDL) requires supervisor approval', async () => {
      const res = await request(app)
        .post('/access-requests')
        .set('Authorization', `Bearer ${dbaToken}`)
        .send({
          profile_id: 4, // DBA Maintenance Profile (requires_approval: 1)
          requested_duration_minutes: 60,
          time_of_day: '10:00',
          justification: 'Schema maintenance and table indexing.'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.decision.action).toBe('require_approval');
    });
  });

  // =========================================================================
  // 3. DEVELOPER ROLE TESTS
  // =========================================================================
  describe('Developer Role Access & Execution', () => {
    it('Developer receives Developer Read Profile as first/default profile', async () => {
      const res = await request(app)
        .get('/profiles/available')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.profiles.length).toBeGreaterThan(0);
      expect(res.body.data.profiles[0].id).toBe(1);
      expect(res.body.data.profiles[0].name).toBe('Developer Read Profile');
    });

    it('Developer activates routine Developer Read Profile without manual approval', async () => {
      const res = await request(app)
        .post('/access-requests')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          profile_id: 1,
          requested_duration_minutes: 60,
          time_of_day: '10:00',
          justification: 'Application bug triage and customer order debugging.'
        });

      expect(res.status).toBe(201);
      expect(['approved', 'active']).toContain(res.body.data.status);
      expect(res.body.data.session_status).toBe('active');
      expect(res.body.data.decision.action).toBe('allow');
      expect(res.body.data.sessionId).toBeDefined();

      devSessionId = res.body.data.sessionId;
    });

    it('Developer executes compliant bounded query: outcome is ALLOWED', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          session_id: devSessionId,
          sql: 'SELECT customer_code, name, credit_limit FROM Customers LIMIT 5;'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.blocked).toBe(false);
      expect(res.body.data.outcome).toBe('ALLOWED');
      expect(res.body.data.rowCount).toBeGreaterThan(0);
    });

    it('Developer executes SELECT * FROM Customers;: outcome is BLOCKED PRE-EXECUTION (UNBOUNDED_BULK_READ)', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          session_id: devSessionId,
          sql: 'SELECT * FROM Customers;'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data.blocked).toBe(true);
      expect(res.body.data.outcome).toBe('BLOCKED PRE-EXECUTION');
      expect(res.body.data.rule).toBe('UNBOUNDED_BULK_READ');
      expect(res.body.data.policyDecision.violations).toContain('UNBOUNDED_BULK_READ');
      expect(res.body.data.rowCount).toBe(0);
      expect(res.body.data.rows.length).toBe(0);
    });

    it('Developer is blocked pre-execution from Payroll table: outcome is DENIED (TABLE_OUT_OF_SCOPE)', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          session_id: devSessionId,
          sql: 'SELECT * FROM Payroll;'
        });

      expect(res.status).toBe(403);
      expect(res.body.data.blocked).toBe(true);
      expect(['BLOCKED PRE-EXECUTION', 'DENIED']).toContain(res.body.data.outcome);
      expect(res.body.data.policyDecision.violations).toContain('TABLE_OUT_OF_SCOPE');
    });

    it('Developer is blocked pre-execution from DELETE: outcome is DENIED (OPERATION_NOT_GRANTED)', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          session_id: devSessionId,
          sql: 'DELETE FROM Customers WHERE id = 1;'
        });

      expect(res.status).toBe(403);
      expect(res.body.data.blocked).toBe(true);
      expect(['BLOCKED PRE-EXECUTION', 'DENIED']).toContain(res.body.data.outcome);
      expect(res.body.data.policyDecision.violations).toContain('OPERATION_NOT_GRANTED');
    });

    it('Developer is blocked pre-execution from DDL: outcome is DENIED (UNAUTHORIZED_DDL)', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          session_id: devSessionId,
          sql: 'DROP TABLE Products;'
        });

      expect(res.status).toBe(403);
      expect(res.body.data.blocked).toBe(true);
      expect(['BLOCKED PRE-EXECUTION', 'DENIED']).toContain(res.body.data.outcome);
      expect(res.body.data.policyDecision.violations).toContain('UNAUTHORIZED_DDL');
    });

    it('Developer requesting Executive Payroll requires supervisor approval', async () => {
      const res = await request(app)
        .post('/access-requests')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          profile_id: 5, // Executive Payroll & Compensation (requires_approval: 1)
          requested_duration_minutes: 45,
          time_of_day: '10:00',
          justification: 'Quarterly payroll reconciliation audit.'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.decision.action).toBe('require_approval');
    });

    it('Developer cannot execute queries against Admin or DBA session (Strict session boundary)', async () => {
      const res = await request(app)
        .post('/workspace/execute')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          session_id: adminSessionId,
          sql: 'SELECT * FROM Customers LIMIT 1;'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SESSION');
    });
  });
});
