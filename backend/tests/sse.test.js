// backend/tests/sse.test.js
import http from 'http';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { sseService } from '../src/services/sse.service.js';

describe('Phase 9 Real-Time SSE Pipeline Tests', () => {
  let server;
  let port;
  let adminToken = '';
  let devToken = '';

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

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
    sseService.close();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  it('rejects /stream request without authentication token with 401', async () => {
    const res = await request(app).get('/stream');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('denies /stream access to standard employee roles with 403', async () => {
    const res = await request(app)
      .get(`/stream?token=${devToken}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('connects to /stream and receives real-time broadcast telemetry', (done) => {
    const testPayload = {
      id: 9999,
      operation: 'SELECT',
      raw_sql: 'SELECT 1 FROM target_db.customers;'
    };

    let buffer = '';
    let broadcastSent = false;

    const req = http.get(`http://127.0.0.1:${port}/stream?token=${adminToken}`, (res) => {
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toContain('no-cache');

      res.on('data', (chunk) => {
        buffer += chunk.toString();

        if (buffer.includes('event: connected') && !broadcastSent) {
          broadcastSent = true;
          // Trigger broadcast to active connection
          setTimeout(() => {
            sseService.broadcast('query_observed', testPayload);
          }, 50);
        }

        if (buffer.includes('event: query_observed')) {
          expect(buffer).toContain('target_db.customers');
          req.destroy();
          done();
        }
      });
    });

    req.on('error', () => {
      // Expected on client abort
    });
  });
});
