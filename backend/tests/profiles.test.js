// backend/tests/profiles.test.js
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';

describe('Phase 3 Resources & Access Profiles Test Suite', () => {
  let adminToken = '';
  let devToken = '';
  let dbaToken = '';
  let createdProfileId = null;

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

    // 3. Authenticate dba
    const dbaRes = await request(app)
      .post('/auth/login')
      .send({ username: 'dba', password: 'Password123!' });
    dbaToken = dbaRes.body.data.accessToken;

    // Clean up any test artifact profiles
    await pool.query("DELETE FROM access_profiles WHERE name = 'QA Staging Read'");
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('GET /profiles/available (Role-based profile filtering)', () => {
    it('developer sees only their permitted profiles', async () => {
      const res = await request(app)
        .get('/profiles/available')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const profileNames = res.body.data.profiles.map(p => p.name);
      expect(profileNames).toContain('Sales & Customer Read-Only');
      expect(profileNames).toContain('Support Order Processing');

      // Crucial: Developer MUST NOT see DBA Maintenance or Financial Audit
      expect(profileNames).not.toContain('DBA Schema & Maintenance');
      expect(profileNames).not.toContain('Financial Audit & Reporting');
    });

    it('dba sees only DBA maintenance and permitted profiles', async () => {
      const res = await request(app)
        .get('/profiles/available')
        .set('Authorization', `Bearer ${dbaToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const profileNames = res.body.data.profiles.map(p => p.name);
      expect(profileNames).toContain('DBA Schema & Maintenance');
      expect(profileNames).not.toContain('Support Order Processing');
    });
  });

  describe('Admin Access Profiles CRUD (/api/profiles)', () => {
    it('non-admin is denied access to /api/profiles with 403', async () => {
      const res = await request(app)
        .get('/api/profiles')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('admin can list all 6 access profiles', async () => {
      const res = await request(app)
        .get('/api/profiles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profiles.length).toBeGreaterThanOrEqual(6);
    });

    it('admin can create a new reusable access profile', async () => {
      const res = await request(app)
        .post('/api/profiles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'QA Staging Read',
          description: 'Profile for QA testing on orders table',
          allowed_operations: ['SELECT'],
          max_duration_minutes: 30,
          max_rows_hint: 200,
          risk_level: 'low',
          requires_approval: false,
          resource_ids: [2, 3], // customers, orders
          role_ids: [3] // developer
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profile.name).toBe('QA Staging Read');
      expect(res.body.data.profile.resources.length).toBe(2);
      expect(res.body.data.profile.roles.length).toBe(1);

      createdProfileId = res.body.data.profile.id;
    });

    it('admin can edit the created profile', async () => {
      const res = await request(app)
        .put(`/api/profiles/${createdProfileId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Updated QA testing profile with extended duration',
          max_duration_minutes: 45
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profile.max_duration_minutes).toBe(45);
      expect(res.body.data.profile.description).toContain('Updated QA testing');
    });

    it('non-admin is denied when attempting to create a profile', async () => {
      const res = await request(app)
        .post('/api/profiles')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          name: 'Hacker Profile',
          description: 'Unauthorized creation',
          allowed_operations: ['SELECT']
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('admin can delete the created profile', async () => {
      const res = await request(app)
        .delete(`/api/profiles/${createdProfileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Resources CRUD (/api/resources)', () => {
    it('admin can list target_db resources with sensitivity levels', async () => {
      const res = await request(app)
        .get('/api/resources')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resources.length).toBeGreaterThanOrEqual(6);

      const tableNames = res.body.data.resources.map(r => r.table_name);
      expect(tableNames).toContain('salaries');
      expect(tableNames).toContain('customers');

      const salariesResource = res.body.data.resources.find(r => r.table_name === 'salaries');
      expect(salariesResource.sensitivity).toBe('critical');
    });
  });
});
