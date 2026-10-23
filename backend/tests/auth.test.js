// backend/tests/auth.test.js
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';

describe('Phase 2 Auth & RBAC Test Suite', () => {
  let adminToken = '';
  let devToken = '';

  afterAll(async () => {
    // Close MySQL connection pool after test suite completes
    await pool.end();
  });

  describe('POST /auth/login', () => {
    it('should successfully log in with valid credentials and return JWT tokens', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          username: 'admin',
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.username).toBe('admin');
      expect(res.body.data.user.roles).toContain('admin');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.password_hash).toBeUndefined();

      adminToken = res.body.data.accessToken;
    });

    it('should fail with 401 when given an incorrect password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          username: 'admin',
          password: 'IncorrectPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should fail with 401 when given a non-existent username', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          username: 'non_existent_user_xyz',
          password: 'Password123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /auth/me', () => {
    it('should return user profile and permissions when authenticated', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('admin');
      expect(res.body.data.user.roles).toContain('admin');
      expect(res.body.data.user.permissions).toContain('users:manage');
    });

    it('should return 401 UNAUTHORIZED when no token is provided', async () => {
      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('RBAC Protected Routes (User Management)', () => {
    beforeAll(async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          username: 'developer',
          password: 'Password123!'
        });
      devToken = res.body.data.accessToken;
    });

    it('should forbid non-admin user (developer) with 403 FORBIDDEN_ROLE', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('should allow admin user to list all users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.users)).toBe(true);
      expect(res.body.data.users.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Audit Logging', () => {
    it('should record login and failure events in audit_log table', async () => {
      const [rows] = await pool.query(
        `SELECT event_type, status FROM audit_log ORDER BY id DESC LIMIT 10`
      );

      const eventTypes = rows.map(r => r.event_type);
      expect(eventTypes).toContain('AUTH_LOGIN');
      expect(eventTypes).toContain('AUTH_LOGIN_FAILED');
    });
  });
});
