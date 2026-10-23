// backend/tests/sessions.test.js
import request from 'supertest';
import mysql from 'mysql2/promise';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

describe('Phase 5 JIT Sessions & MySQL User Provisioning Tests', () => {
  let adminToken = '';
  let devToken = '';

  let autoApprovedCreds = null;
  let autoApprovedSessionId = null;
  let pendingRequestId = null;

  beforeAll(async () => {
    // 1. Admin login
    const adminRes = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'Password123!' });
    adminToken = adminRes.body.data.accessToken;

    // 2. Dev login
    const devRes = await request(app)
      .post('/auth/login')
      .send({ username: 'developer', password: 'Password123!' });
    devToken = devRes.body.data.accessToken;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Auto-Approval JIT Flow (Sales Read-Only)', () => {
    it('developer submits request for auto-approve profile -> receives JIT MySQL credentials', async () => {
      const res = await request(app)
        .post('/access-requests')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          profile_id: 1, // Developer Read Profile
          requested_duration_minutes: 30,
          justification: 'Quarterly sales territory reporting analysis'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('approved');
      expect(res.body.data.credentials).toBeDefined();

      autoApprovedCreds = res.body.data.credentials;
      expect(autoApprovedCreds.username).toMatch(/^jit_\d+_[a-f0-9]+$/);
      expect(autoApprovedCreds.password).toBeDefined();

      // Retrieve sessionId from db_sessions
      const [rows] = await pool.query(
        `SELECT id FROM db_sessions WHERE mysql_username = ? LIMIT 1`,
        [autoApprovedCreds.username]
      );
      expect(rows.length).toBe(1);
      autoApprovedSessionId = rows[0].id;
    });

    it('ephemeral JIT user can execute allowed SELECT on granted table', async () => {
      expect(autoApprovedCreds).not.toBeNull();

      // Connect to MySQL directly with the newly created JIT user
      const jitConn = await mysql.createConnection({
        host: env.DB.HOST,
        port: env.DB.PORT,
        user: autoApprovedCreds.username,
        password: autoApprovedCreds.password,
        database: env.DB.TARGET_NAME
      });

      const [rows] = await jitConn.query(`SELECT count(*) AS cust_count FROM \`${env.DB.TARGET_NAME}\`.\`Customers\``);
      expect(Number(rows[0].cust_count)).toBeGreaterThanOrEqual(10);

      await jitConn.end();
    });

    it('ephemeral JIT user is DENIED access to ungranted table (Payroll)', async () => {
      const jitConn = await mysql.createConnection({
        host: env.DB.HOST,
        port: env.DB.PORT,
        user: autoApprovedCreds.username,
        password: autoApprovedCreds.password,
        database: env.DB.TARGET_NAME
      });

      // Attempting to query ungranted table 'Payroll' must throw MySQL permission error (1142)
      await expect(
        jitConn.query(`SELECT * FROM \`${env.DB.TARGET_NAME}\`.\`Payroll\` LIMIT 1`)
      ).rejects.toThrow(/SELECT command denied to user/i);

      await jitConn.end();
    });

    it('ephemeral JIT user is DENIED ungranted operation (DELETE on Customers)', async () => {
      const jitConn = await mysql.createConnection({
        host: env.DB.HOST,
        port: env.DB.PORT,
        user: autoApprovedCreds.username,
        password: autoApprovedCreds.password,
        database: env.DB.TARGET_NAME
      });

      // Attempting ungranted DELETE operation must fail with permission error
      await expect(
        jitConn.query(`DELETE FROM \`${env.DB.TARGET_NAME}\`.\`Customers\` WHERE customer_code = 'CUST-001'`)
      ).rejects.toThrow(/DELETE command denied to user/i);

      await jitConn.end();
    });
  });

  describe('Approval Queue Flow (HR Staff Payroll & Compensation)', () => {
    it('developer submits request for critical profile -> routed to pending queue by OPA', async () => {
      const res = await request(app)
        .post('/access-requests')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          profile_id: 5, // Executive Payroll & Compensation
          requested_duration_minutes: 45,
          justification: 'Annual compensation benchmarking and payroll audit'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.credentials).toBeUndefined();

      pendingRequestId = res.body.data.requestId;
    });

    it('admin views pending requests queue', async () => {
      const res = await request(app)
        .get('/access-requests/pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const requestIds = res.body.data.requests.map(r => r.id);
      expect(requestIds).toContain(pendingRequestId);
    });

    it('admin approves pending request -> temporary MySQL user is created', async () => {
      const res = await request(app)
        .post(`/access-requests/${pendingRequestId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ comments: 'Approved for payroll audit' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.credentials).toBeDefined();

      const hrJitCreds = res.body.data.credentials;
      expect(hrJitCreds.username).toMatch(/^jit_\d+_[a-f0-9]+$/);

      // Verify connection with approved HR user
      const hrConn = await mysql.createConnection({
        host: env.DB.HOST,
        port: env.DB.PORT,
        user: hrJitCreds.username,
        password: hrJitCreds.password,
        database: env.DB.TARGET_NAME
      });

      const [salRows] = await hrConn.query(`SELECT count(*) AS sal_count FROM \`${env.DB.TARGET_NAME}\`.\`Payroll\``);
      expect(Number(salRows[0].sal_count)).toBeGreaterThanOrEqual(15);

      await hrConn.end();
    });
  });

  describe('Session Revocation & Connection Teardown', () => {
    it('admin force-revokes an active session -> drops user from MySQL', async () => {
      expect(autoApprovedSessionId).not.toBeNull();

      const res = await request(app)
        .post(`/sessions/${autoApprovedSessionId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify user is gone from MySQL
      await expect(
        mysql.createConnection({
          host: env.DB.HOST,
          port: env.DB.PORT,
          user: autoApprovedCreds.username,
          password: autoApprovedCreds.password,
          database: env.DB.TARGET_NAME
        })
      ).rejects.toThrow(/Access denied for user/i);
    });
  });
});
