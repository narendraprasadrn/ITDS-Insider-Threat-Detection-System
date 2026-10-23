// backend/tests/riskEngine.test.js
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';
import {
  detectHighQueryVelocity,
  detectBulkExport,
  detectOffHoursActivity,
  detectOutOfProfileTable,
  detectRapidFailedQueries,
  detectCrossSchemaRead
} from '../src/services/detectors/index.js';
import { riskEngineService } from '../src/services/riskEngine.service.js';

describe('Phase 8 Threat Detection Engine & Risk Scoring Tests', () => {
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

  describe('Pure Detector Functions with Fixture Event Streams', () => {
    const baseline = {
      avg_velocity_qpm: 6.0,
      typical_tables: ['target_db.customers', 'target_db.orders'],
      typical_hours_start: 9,
      typical_hours_end: 18
    };

    it('detectHighQueryVelocity fires when QPM exceeds 2x baseline', () => {
      // 8 queries over 10 seconds = ~48 QPM > 12 QPM threshold
      const baseTime = new Date('2026-10-22T10:00:00Z').getTime();
      const events = Array.from({ length: 8 }, (_, i) => ({
        id: 100 + i,
        event_time: new Date(baseTime + i * 1500)
      }));

      const result = detectHighQueryVelocity(events, baseline);
      expect(result).not.toBeNull();
      expect(result.rule_id).toBe('high_query_velocity');
      expect(result.weight).toBe(25);
      expect(result.evidence_event_ids.length).toBe(8);
      expect(result.explanation).toContain('QPM');
    });

    it('detectHighQueryVelocity returns null for nominal query rate', () => {
      const baseTime = new Date('2026-10-22T10:00:00Z').getTime();
      const events = [
        { id: 1, event_time: new Date(baseTime) },
        { id: 2, event_time: new Date(baseTime + 60000) }
      ];

      const result = detectHighQueryVelocity(events, baseline);
      expect(result).toBeNull();
    });

    it('detectBulkExport fires for unbounded SELECT * queries', () => {
      const events = [
        {
          id: 201,
          operation: 'SELECT',
          raw_sql: 'SELECT * FROM customers;',
          flags: { select_star: true, has_limit: false, is_unbounded_read: true }
        }
      ];

      const result = detectBulkExport(events, baseline);
      expect(result).not.toBeNull();
      expect(result.rule_id).toBe('bulk_export');
      expect(result.weight).toBe(30);
      expect(result.evidence_event_ids).toContain(201);
    });

    it('detectBulkExport returns null for bounded queries', () => {
      const events = [
        {
          id: 202,
          operation: 'SELECT',
          raw_sql: 'SELECT id, name FROM customers WHERE id = 1 LIMIT 1;',
          flags: { select_star: false, has_limit: true, has_where: true, is_unbounded_read: false }
        }
      ];

      const result = detectBulkExport(events, baseline);
      expect(result).toBeNull();
    });

    it('detectOffHoursActivity fires for queries executed late at night', () => {
      const events = [
        { id: 301, event_time: new Date('2026-10-22T02:30:00') }, // 2:30 AM (outside 9-18)
        { id: 302, event_time: new Date('2026-10-22T03:15:00') }  // 3:15 AM
      ];

      const result = detectOffHoursActivity(events, baseline);
      expect(result).not.toBeNull();
      expect(result.rule_id).toBe('off_hours_activity');
      expect(result.weight).toBe(20);
      expect(result.evidence_event_ids).toEqual([301, 302]);
    });

    it('detectOffHoursActivity returns null for business-hours queries', () => {
      const events = [
        { id: 303, event_time: new Date('2026-10-22T14:30:00') } // 2:30 PM (inside 9-18)
      ];

      const result = detectOffHoursActivity(events, baseline);
      expect(result).toBeNull();
    });

    it('detectOutOfProfileTable fires when accessing unprofiled tables', () => {
      const events = [
        { id: 401, tables: ['target_db.salaries'] } // salaries is not in baseline (customers, orders)
      ];

      const result = detectOutOfProfileTable(events, baseline);
      expect(result).not.toBeNull();
      expect(result.rule_id).toBe('out_of_profile_table');
      expect(result.weight).toBe(25);
      expect(result.evidence_event_ids).toContain(401);
      expect(result.explanation).toContain('target_db.salaries');
    });

    it('detectOutOfProfileTable returns null for typical tables', () => {
      const events = [
        { id: 402, tables: ['target_db.customers', 'target_db.orders'] }
      ];

      const result = detectOutOfProfileTable(events, baseline);
      expect(result).toBeNull();
    });

    it('detectRapidFailedQueries fires for multiple blocked or denied queries', () => {
      const events = [
        { id: 501, status: 'failed', has_blocked_violation: true },
        { id: 502, status: 'failed', has_blocked_violation: true }
      ];

      const result = detectRapidFailedQueries(events, baseline);
      expect(result).not.toBeNull();
      expect(result.rule_id).toBe('rapid_failed_queries');
      expect(result.weight).toBe(25);
      expect(result.evidence_event_ids).toEqual([501, 502]);
    });

    it('detectCrossSchemaRead fires when accessing system or cross schemas', () => {
      const events = [
        {
          id: 601,
          tables: ['target_db.customers', 'mysql.user'],
          flags: { is_cross_schema: true }
        }
      ];

      const result = detectCrossSchemaRead(events, baseline);
      expect(result).not.toBeNull();
      expect(result.rule_id).toBe('cross_schema_read');
      expect(result.weight).toBe(30);
      expect(result.evidence_event_ids).toContain(601);
    });
  });

  describe('Deterministic & Fully Explainable Risk Score Aggregation', () => {
    it('aggregates multiple fired detectors into a deterministic score and breakdown', () => {
      const baseline = {
        avg_velocity_qpm: 6.0,
        typical_tables: ['target_db.customers'],
        typical_hours_start: 9,
        typical_hours_end: 18
      };

      // Events triggering:
      // 1. Bulk export (weight 30)
      // 2. Off hours (weight 20)
      // 3. Out of profile table (weight 25)
      // Total = 75 -> risk_level: 'critical'
      const events = [
        {
          id: 701,
          event_time: new Date('2026-10-22T23:30:00'),
          operation: 'SELECT',
          tables: ['target_db.salaries'],
          flags: { select_star: true, has_limit: false, is_unbounded_read: true }
        }
      ];

      const { score, risk_level, breakdown } = riskEngineService.calculateRiskScore(events, baseline);

      expect(score).toBe(75);
      expect(risk_level).toBe('critical');
      expect(breakdown.length).toBe(3);

      const ruleIds = breakdown.map(b => b.rule_id);
      expect(ruleIds).toContain('bulk_export');
      expect(ruleIds).toContain('off_hours_activity');
      expect(ruleIds).toContain('out_of_profile_table');

      // Verify every breakdown item has rule_id, weight, evidence_event_ids, explanation
      for (const item of breakdown) {
        expect(item.rule_id).toBeDefined();
        expect(typeof item.weight).toBe('number');
        expect(Array.isArray(item.evidence_event_ids)).toBe(true);
        expect(typeof item.explanation).toBe('string');
      }
    });

    it('caps aggregate score at 100', () => {
      const baseline = {
        avg_velocity_qpm: 2.0,
        typical_tables: ['target_db.customers'],
        typical_hours_start: 9,
        typical_hours_end: 18
      };

      const baseTime = new Date('2026-10-22T03:00:00Z').getTime();
      // Fires velocity (25), bulk export (30), off hours (20), out of profile (25), cross schema (30) = 130
      const events = Array.from({ length: 8 }, (_, i) => ({
        id: 800 + i,
        event_time: new Date(baseTime + i * 1000),
        operation: 'SELECT',
        tables: ['target_db.salaries', 'mysql.user'],
        flags: { select_star: true, has_limit: false, is_unbounded_read: true, is_cross_schema: true }
      }));

      const { score, risk_level } = riskEngineService.calculateRiskScore(events, baseline);
      expect(score).toBe(100);
      expect(risk_level).toBe('critical');
    });
  });

  describe('End-to-End Alert Workflow & Deduplication', () => {
    let testSessionId = null;

    beforeAll(async () => {
      // Create a test session in db_sessions
      const [res] = await pool.query(
        `INSERT INTO db_sessions (request_id, user_id, profile_id, status, end_time, mysql_username, granted_operations, granted_resources)
         VALUES (1, 3, 1, 'active', DATE_ADD(NOW(), INTERVAL 1 HOUR), 'jit_test_risk_1', '["SELECT"]', '["target_db.customers"]')`
      );
      testSessionId = res.insertId;

      // Insert high-risk queries into sql_events
      await pool.query(
        `INSERT INTO sql_events (session_id, user_id, mysql_username, thread_id, event_time, raw_sql, operation, tables, flags, status)
         VALUES
         (?, 3, 'jit_test_risk_1', 999, '2026-10-22 02:30:00', 'SELECT * FROM target_db.salaries;', 'SELECT', '["target_db.salaries"]', '{"select_star": true, "has_limit": false, "is_unbounded_read": true}', 'attributed')`,
        [testSessionId]
      );
    });

    afterAll(async () => {
      if (testSessionId) {
        await pool.query(`DELETE FROM db_sessions WHERE id = ?`, [testSessionId]);
      }
    });

    it('evaluates session risk and creates a security alert for score >= 70', async () => {
      const scoreData = await riskEngineService.evaluateSessionRisk(testSessionId);
      expect(scoreData).not.toBeNull();
      expect(scoreData.score).toBeGreaterThanOrEqual(70);

      // Verify alert was inserted
      const alerts = await riskEngineService.listAlerts({ sessionId: testSessionId });
      expect(alerts.length).toBe(1);
      expect(alerts[0].status).toBe('open');
      expect(alerts[0].risk_score).toBe(scoreData.score);
      expect(alerts[0].evidence.length).toBeGreaterThanOrEqual(2);
    });

    it('deduplicates alerts for subsequent evaluations of the same session', async () => {
      // Re-evaluate session risk
      await riskEngineService.evaluateSessionRisk(testSessionId);

      // Verify still only 1 alert exists
      const alerts = await riskEngineService.listAlerts({ sessionId: testSessionId });
      expect(alerts.length).toBe(1);
    });

    it('transitions alert status via PATCH /alerts/:id', async () => {
      const alerts = await riskEngineService.listAlerts({ sessionId: testSessionId });
      const alertId = alerts[0].id;

      const patchRes = await request(app)
        .patch(`/alerts/${alertId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'investigating',
          notes: 'Analyst verified potential data exfiltration attempt'
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.status).toBe('investigating');

      // Verify in DB
      const updatedAlerts = await riskEngineService.listAlerts({ sessionId: testSessionId });
      expect(updatedAlerts[0].status).toBe('investigating');
      expect(updatedAlerts[0].analyst_notes).toContain('exfiltration');
    });

    it('denies access to /alerts and /risk-scores for non-privileged roles', async () => {
      const res = await request(app)
        .get('/alerts')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(403);
    });
  });
});
