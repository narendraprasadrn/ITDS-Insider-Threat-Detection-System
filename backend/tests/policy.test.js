// backend/tests/policy.test.js
import request from 'supertest';
import app from '../src/app.js';
import { policyService } from '../src/services/policy.service.js';
import { pool } from '../src/db/pool.js';

describe('Phase 4 OPA Policy Engine Integration Tests', () => {
  let devToken = '';

  beforeAll(async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'developer', password: 'Password123!' });
    devToken = res.body.data.accessToken;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('policyService.evaluateAccessRequest', () => {
    it('should return action: allow for standard read request within business hours', async () => {
      const decision = await policyService.evaluateAccessRequest({
        user: { username: 'developer', roles: ['developer'] },
        profile: { name: 'Sales Read', requires_approval: false },
        resources: [{ table_name: 'customers', sensitivity: 'low' }],
        operations: ['SELECT'],
        requested_duration: 60,
        time_of_day: '14:00',
        sensitivity: 'low'
      });

      expect(decision.action).toBe('allow');
      expect(decision.allow).toBe(true);
      expect(decision.deny).toBe(false);
    });

    it('should return action: require_approval for critical resources (salaries)', async () => {
      const decision = await policyService.evaluateAccessRequest({
        user: { username: 'developer', roles: ['developer'] },
        profile: { name: 'HR Payroll', requires_approval: true },
        resources: [{ table_name: 'salaries', sensitivity: 'critical' }],
        operations: ['SELECT'],
        requested_duration: 45,
        time_of_day: '11:00',
        sensitivity: 'critical'
      });

      expect(decision.action).toBe('require_approval');
      expect(decision.require_approval).toBe(true);
      expect(decision.deny).toBe(false);
      expect(decision.reasons.length).toBeGreaterThan(0);
    });

    it('should return action: deny for DDL requested by non-DBA', async () => {
      const decision = await policyService.evaluateAccessRequest({
        user: { username: 'developer', roles: ['developer'] },
        profile: { name: 'Dev Profile', requires_approval: false },
        resources: [{ table_name: 'orders', sensitivity: 'medium' }],
        operations: ['SELECT', 'DDL'],
        requested_duration: 30,
        time_of_day: '10:00',
        sensitivity: 'medium'
      });

      expect(decision.action).toBe('deny');
      expect(decision.deny).toBe(true);
      expect(decision.allow).toBe(false);
    });

    it('should return action: deny for high-sensitivity off-hours request by non-admin', async () => {
      const decision = await policyService.evaluateAccessRequest({
        user: { username: 'developer', roles: ['developer'] },
        profile: { name: 'Financial Audit', requires_approval: true },
        resources: [{ table_name: 'payments', sensitivity: 'high' }],
        operations: ['SELECT'],
        requested_duration: 60,
        time_of_day: '23:30',
        sensitivity: 'high'
      });

      expect(decision.action).toBe('deny');
      expect(decision.deny).toBe(true);
    });
  });

  describe('policyService.evaluateSqlQuery', () => {
    it('should allow query matching session grants', async () => {
      const result = await policyService.evaluateSqlQuery(
        {
          granted_operations: ['SELECT'],
          granted_resources: ['target_db.customers'],
          is_expired: false
        },
        {
          operation: 'SELECT',
          tables: ['target_db.customers'],
          has_where: true,
          select_star: false,
          has_limit: true,
          is_ddl: false
        }
      );

      expect(result.allow).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should flag OPERATION_NOT_GRANTED when operation is ungranted', async () => {
      const result = await policyService.evaluateSqlQuery(
        {
          granted_operations: ['SELECT'],
          granted_resources: ['target_db.customers'],
          is_expired: false
        },
        {
          operation: 'DELETE',
          tables: ['target_db.customers'],
          has_where: true,
          select_star: false,
          has_limit: false,
          is_ddl: false
        }
      );

      expect(result.allow).toBe(false);
      expect(result.violations).toContain('OPERATION_NOT_GRANTED');
    });

    it('should flag TABLE_OUT_OF_SCOPE when query accesses unauthorized table', async () => {
      const result = await policyService.evaluateSqlQuery(
        {
          granted_operations: ['SELECT'],
          granted_resources: ['target_db.customers'],
          is_expired: false
        },
        {
          operation: 'SELECT',
          tables: ['target_db.salaries'],
          has_where: false,
          select_star: false,
          has_limit: true,
          is_ddl: false
        }
      );

      expect(result.allow).toBe(false);
      expect(result.violations).toContain('TABLE_OUT_OF_SCOPE');
    });
  });

  describe('POST /api/policy/evaluate (Dev endpoint)', () => {
    it('should return 200 and evaluation result for access_request', async () => {
      const res = await request(app)
        .post('/api/policy/evaluate')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          policy: 'access_request',
          input: {
            user: { username: 'developer', roles: ['developer'] },
            profile: { name: 'Sales Read' },
            resources: [{ table_name: 'customers', sensitivity: 'low' }],
            operations: ['SELECT'],
            requested_duration: 60,
            time_of_day: '12:00',
            sensitivity: 'low'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.action).toBe('allow');
    });
  });
});
