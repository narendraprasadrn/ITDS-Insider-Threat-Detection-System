// backend/tests/ingestor.test.js
import request from 'supertest';
import mysql from 'mysql2/promise';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';
import { sqlParserService } from '../src/services/sqlParser.service.js';
import { ingestorService } from '../src/services/ingestor.service.js';

describe('Phase 6 SQL Activity Ingestion Tests', () => {
  let adminToken = '';
  let devToken = '';

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'Password123!' });
    adminToken = adminRes.body.data.accessToken;

    const devRes = await request(app)
      .post('/auth/login')
      .send({ username: 'developer', password: 'Password123!' });
    devToken = devRes.body.data.accessToken;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('SQL Parser Unit Capabilities', () => {
    it('correctly parses SELECT with WHERE, LIMIT, and table extraction', () => {
      const parsed = sqlParserService.parse(
        'SELECT customer_code, company_name FROM target_db.customers WHERE city = "New York" LIMIT 10;'
      );

      expect(parsed.operation).toBe('SELECT');
      expect(parsed.tables).toContain('target_db.customers');
      expect(parsed.flags.has_where).toBe(true);
      expect(parsed.flags.has_limit).toBe(true);
      expect(parsed.flags.limit_count).toBe(10);
      expect(parsed.flags.select_star).toBe(false);
      expect(parsed.flags.is_ddl).toBe(false);
    });

    it('correctly identifies unbounded SELECT * (no LIMIT clause)', () => {
      const parsed = sqlParserService.parse(
        'SELECT * FROM target_db.orders WHERE order_date >= "2024-01-01"'
      );

      expect(parsed.operation).toBe('SELECT');
      expect(parsed.tables).toContain('target_db.orders');
      expect(parsed.flags.select_star).toBe(true);
      expect(parsed.flags.has_limit).toBe(false);
    });

    it('identifies DDL operations (ALTER / CREATE / DROP)', () => {
      const parsed = sqlParserService.parse(
        'ALTER TABLE target_db.employees ADD COLUMN temp_col INT;'
      );

      expect(parsed.operation).toBe('ALTER');
      expect(parsed.flags.is_ddl).toBe(true);
    });

    it('detects inline SQL comments and multi-statement queries', () => {
      const parsed = sqlParserService.parse(
        'SELECT 1 FROM target_db.customers; -- probing comment\nSELECT 2;'
      );

      expect(parsed.flags.has_comments).toBe(true);
      expect(parsed.flags.multi_statement).toBe(true);
    });
  });

  describe('End-to-End Server-Side Activity Ingestion', () => {
    let jitCreds = null;
    let jitSessionId = null;

    beforeAll(async () => {
      // 1. Provision a JIT session for developer
      const reqRes = await request(app)
        .post('/access-requests')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          profile_id: 1, // Sales & Customer Read-Only
          requested_duration_minutes: 30,
          justification: 'Ingestion test session'
        });

      jitCreds = reqRes.body.data.credentials;

      const [rows] = await pool.query(
        `SELECT id FROM db_sessions WHERE mysql_username = ? LIMIT 1`,
        [jitCreds.username]
      );
      jitSessionId = rows[0].id;
    });

    it('executes query under JIT user and verifies ingestion from general_log', async () => {
      expect(jitCreds).not.toBeNull();

      // 2. Connect with JIT credentials and run real query against target_db
      const jitConn = await mysql.createConnection({
        host: env.DB.HOST,
        port: env.DB.PORT,
        user: jitCreds.username,
        password: jitCreds.password,
        database: env.DB.TARGET_NAME
      });

      const uniqueMarker = `test_marker_${Date.now()}`;
      await jitConn.query(`SELECT customer_code, company_name FROM target_db.customers WHERE city = 'Denver' LIMIT 3; -- ${uniqueMarker}`);
      await jitConn.end();

      // 3. Trigger ingestor polling cycle
      const ingestedCount = await ingestorService.poll();
      expect(ingestedCount).toBeGreaterThanOrEqual(1);

      // 4. Query sql_events table and verify attribution
      const [events] = await pool.query(
        `SELECT id, session_id, user_id, mysql_username, raw_sql, operation, tables, flags, status
         FROM sql_events WHERE mysql_username = ? ORDER BY id DESC LIMIT 5`,
        [jitCreds.username]
      );

      expect(events.length).toBeGreaterThanOrEqual(1);
      const matchedEvent = events.find(e => e.raw_sql.includes(uniqueMarker));
      expect(matchedEvent).toBeDefined();

      expect(matchedEvent.session_id).toBe(jitSessionId);
      expect(matchedEvent.status).toBe('attributed');
      expect(matchedEvent.operation).toBe('SELECT');

      const parsedFlags = typeof matchedEvent.flags === 'string' ? JSON.parse(matchedEvent.flags) : matchedEvent.flags;
      expect(parsedFlags.has_limit).toBe(true);
      expect(parsedFlags.limit_count).toBe(3);
    });

    it('admin can list ingested sql_events via GET /sql-events with filters', async () => {
      const res = await request(app)
        .get(`/sql-events?session_id=${jitSessionId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.events.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.events[0].mysql_username).toBe(jitCreds.username);
    });

    it('non-authorized user (developer) is denied access to /sql-events', async () => {
      const res = await request(app)
        .get('/sql-events')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });
  });
});
