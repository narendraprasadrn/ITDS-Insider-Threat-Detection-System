// scripts/simulate/helpers.js
import mysql from '../../backend/node_modules/mysql2/promise.js';

export const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:5000';

/**
 * Authenticate against ITDS backend
 */
export async function login(username, password = 'Password123!') {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(data)}`);
  }
  return {
    token: data.data.accessToken,
    user: data.data.user
  };
}

/**
 * Submit an access request
 */
export async function requestJitSession(token, profileId, durationMinutes = 30, justification = 'Simulated test activity') {
  const res = await fetch(`${BACKEND_URL}/access-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      profile_id: profileId,
      requested_duration_minutes: durationMinutes,
      justification
    })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`Access request failed: ${JSON.stringify(data)}`);
  }
  return data.data;
}

/**
 * Approve a pending access request as admin
 */
export async function approveAccessRequest(adminToken, requestId, comments = 'Approved by security admin') {
  const res = await fetch(`${BACKEND_URL}/access-requests/${requestId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ comments })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`Approval failed for request #${requestId}: ${JSON.stringify(data)}`);
  }
  return data.data;
}

/**
 * Establish a direct MySQL connection
 */
export async function createDirectConnection(creds) {
  return await mysql.createConnection({
    host: creds.host || '127.0.0.1',
    port: creds.port || 3306,
    user: creds.username,
    password: creds.password,
    database: creds.database || 'target_db'
  });
}

/**
 * Execute an array of queries sequentially
 */
export async function executeQueries(connection, queries, delayMs = 120) {
  const results = [];
  for (const q of queries) {
    const startTime = Date.now();
    try {
      const [rows] = await connection.query(q);
      results.push({
        sql: q,
        success: true,
        rowsCount: Array.isArray(rows) ? rows.length : undefined,
        durationMs: Date.now() - startTime
      });
    } catch (err) {
      results.push({
        sql: q,
        success: false,
        error: err.code || err.message,
        durationMs: Date.now() - startTime
      });
    }
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

/**
 * Wait for backend general_log ingestion poller
 */
export async function waitForIngestion(ms = 3500) {
  await new Promise(r => setTimeout(r, ms));
}

/**
 * Fetch risk score for a session
 */
export async function fetchRiskScore(adminToken, sessionId) {
  const res = await fetch(`${BACKEND_URL}/risk-scores/${sessionId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  return data.success ? data.data.risk_score : null;
}

/**
 * Fetch policy violations for a session
 */
export async function fetchViolations(adminToken, sessionId) {
  const res = await fetch(`${BACKEND_URL}/violations?session_id=${sessionId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  return data.success ? (data.data.violations || []) : [];
}

/**
 * Fetch alerts for a session
 */
export async function fetchAlerts(adminToken, sessionId) {
  const res = await fetch(`${BACKEND_URL}/alerts?session_id=${sessionId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  return data.success ? (data.data.alerts || []) : [];
}

/**
 * Fetch SQL events for a session
 */
export async function fetchSqlEvents(adminToken, sessionId) {
  const res = await fetch(`${BACKEND_URL}/sql-events?session_id=${sessionId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  return data.success ? (data.data.events || []) : [];
}

/**
 * Revoke a session
 */
export async function revokeSession(adminToken, sessionId) {
  const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  return data.success ? data.data : null;
}
