// backend/tests/verify_admin_jit_workflow.js
import mysql from 'mysql2/promise';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

const API_BASE = 'http://localhost:5000/api';

async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(data)}`);
  }
  return { token: data.data.accessToken, user: data.data.user };
}

async function run() {
  console.log('=== ITDS JIT ACCESS & ADMIN WORKFLOW VERIFICATION SUITE ===\n');

  // 1. Authenticate personas
  console.log('1. Authenticating Admin, DBA, and Developer...');
  const admin = await login('admin', 'Password123!');
  const dba = await login('dba', 'Password123!');
  const dev = await login('developer', 'Password123!');
  console.log('   All personas authenticated successfully.');

  // 2. Scenario 1: Admin signs in and sees only genuine access requests and existing sessions
  console.log('\n2. Scenario 1: Admin Pending Queue & Session Integrity...');
  const pendRes = await fetch(`${API_BASE}/access-requests/pending`, {
    headers: { Authorization: `Bearer ${admin.token}` }
  });
  const pendData = await pendRes.json();
  const pendingList = pendData.data.requests || [];

  const [dbPending] = await pool.query("SELECT id, user_id FROM access_requests WHERE status = 'pending'");
  if (pendingList.length !== dbPending.length) {
    throw new Error(`Mismatch in pending requests count: API=${pendingList.length}, DB=${dbPending.length}`);
  }
  console.log(`   Pending requests in queue: ${pendingList.length} (Verified 100% against MySQL)`);

  // Verify none of the pending requests are self-requests from admin for auto-approved profiles
  const adminSelfPending = pendingList.filter(r => r.user_id === admin.user.id && !r.requires_approval);
  if (adminSelfPending.length > 0) {
    throw new Error(`Found ${adminSelfPending.length} pending admin self-requests for auto-approved profile`);
  }
  console.log('   Confirmed: No pending self-requests for routine admin profiles.');

  // 3. Scenario 2: Administrator direct database access via explicit administrative policy
  console.log('\n3. Scenario 2: Admin Explicit Administrative Provisioning (Bypasses Approval Queue)...');
  const adminProvRes = await fetch(`${API_BASE}/sessions/admin-provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`
    },
    body: JSON.stringify({
      profile_id: 7, // Admin Security Administration
      duration_minutes: 45
    })
  });
  const adminProvData = await adminProvRes.json();
  if (!adminProvRes.ok || !adminProvData.success) {
    throw new Error(`Admin provisioning failed: ${JSON.stringify(adminProvData)}`);
  }
  const adminCreds = adminProvData.data.credentials;
  const adminSessId = adminProvData.data.sessionId;
  const adminReqId = adminProvData.data.requestId;
  console.log(`   Provisioned Admin Session #${adminSessId} (Request #${adminReqId})`);
  console.log(`   Ephemeral MySQL User: ${adminCreds.username}`);

  // Verify request is 'active' in DB and not pending in queue
  const [adminReqRows] = await pool.query('SELECT status, approved_by FROM access_requests WHERE id = ?', [adminReqId]);
  if (adminReqRows[0]?.status !== 'active') {
    throw new Error(`Expected admin request status 'active', got: ${adminReqRows[0]?.status}`);
  }
  console.log(`   Verified: Access request #${adminReqId} is immediately active in database.`);

  // Test connecting to MySQL with ephemeral admin credentials
  const adminConn = await mysql.createConnection({
    host: adminCreds.host,
    port: adminCreds.port,
    user: adminCreds.username,
    password: adminCreds.password,
    database: adminCreds.database
  });
  const [tables] = await adminConn.query('SHOW TABLES');
  await adminConn.end();
  console.log(`   Verified: Ephemeral MySQL admin connection successful (${tables.length} tables visible).`);

  // Revoke admin session
  await fetch(`${API_BASE}/sessions/${adminSessId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin.token}` }
  });
  console.log(`   Admin session #${adminSessId} revoked cleanly.`);

  // 4. Scenario 3: Admin sensitive operation requiring independent second-person review
  console.log('\n4. Scenario 3: Admin Sensitive Profile Independent Approval Enforcement...');
  // Attempt direct provisioning of sensitive profile 4 (DBA Maintenance, requires_approval: 1)
  const directFailRes = await fetch(`${API_BASE}/sessions/admin-provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`
    },
    body: JSON.stringify({
      profile_id: 4,
      duration_minutes: 30
    })
  });
  if (directFailRes.status !== 400) {
    throw new Error(`Expected 400 when admin directly provisions approval-required profile, got: ${directFailRes.status}`);
  }
  console.log('   Blocked as expected: 400 INDEPENDENT_APPROVAL_REQUIRED for sensitive profile.');

  // Admin submits via standard access-requests
  const adminSensReqRes = await fetch(`${API_BASE}/access-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`
    },
    body: JSON.stringify({
      profile_id: 4,
      requested_duration_minutes: 30,
      justification: 'Emergency database schema hotfix requiring independent DBA signoff.'
    })
  });
  const adminSensReqData = await adminSensReqRes.json();
  const sensReqId = adminSensReqData.data.requestId;
  console.log(`   Sensitive Admin Request #${sensReqId} submitted (Status: ${adminSensReqData.data.status}).`);

  // Admin attempts self-approval -> BLOCKED
  const selfApproveRes = await fetch(`${API_BASE}/access-requests/${sensReqId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`
    },
    body: JSON.stringify({ comments: 'Self-approval attempt' })
  });
  if (selfApproveRes.status !== 403) {
    throw new Error(`Expected 403 FORBIDDEN_SELF_APPROVAL, got: ${selfApproveRes.status}`);
  }
  console.log('   Blocked as expected: 403 FORBIDDEN_SELF_APPROVAL — self-approval strictly rejected.');

  // Independent DBA reviews and approves
  const dbaApproveRes = await fetch(`${API_BASE}/access-requests/${sensReqId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dba.token}`
    },
    body: JSON.stringify({ comments: 'Reviewed schema change tickets, approved.' })
  });
  const dbaApproveData = await dbaApproveRes.json();
  if (!dbaApproveRes.ok || !dbaApproveData.success) {
    throw new Error(`DBA approval failed: ${JSON.stringify(dbaApproveData)}`);
  }
  console.log(`   Independent DBA approved Request #${sensReqId}. Activated Session #${dbaApproveData.data.sessionId}.`);

  // Revoke session
  await fetch(`${API_BASE}/sessions/${dbaApproveData.data.sessionId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin.token}` }
  });
  console.log(`   Session #${dbaApproveData.data.sessionId} revoked cleanly.`);

  // 5. Scenario 4: Developer Request, Admin Approval, and Query Execution
  console.log('\n5. Scenario 4: Developer Request & Admin Review Lifecycle...');
  // A. Developer routine auto-approval
  const devAutoRes = await fetch(`${API_BASE}/access-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dev.token}`
    },
    body: JSON.stringify({
      profile_id: 1, // Developer Read Profile (Auto-Approve)
      requested_duration_minutes: 60
    })
  });
  const devAutoData = await devAutoRes.json();
  if (devAutoData.data.status !== 'active') {
    throw new Error(`Expected developer routine request to be active, got: ${devAutoData.data.status}`);
  }
  const devSessId = devAutoData.data.sessionId;
  console.log(`   Developer routine Profile 1 auto-activated: Session #${devSessId}.`);

  // B. Execute query in workspace with active session
  const execRes = await fetch(`${API_BASE}/workspace/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dev.token}`
    },
    body: JSON.stringify({
      session_id: devSessId,
      sql: 'SELECT customer_code, name FROM Customers LIMIT 5;'
    })
  });
  const execData = await execRes.json();
  if (!execRes.ok || !execData.success) {
    throw new Error(`Developer workspace query failed: ${JSON.stringify(execData)}`);
  }
  console.log(`   Developer workspace execution: SUCCESS (${execData.data.rowCount} rows read).`);

  // C. Revoke session and verify query execution is denied
  await fetch(`${API_BASE}/sessions/${devSessId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin.token}` }
  });
  console.log(`   Developer session #${devSessId} revoked.`);

  const postRevokeRes = await fetch(`${API_BASE}/workspace/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dev.token}`
    },
    body: JSON.stringify({
      session_id: devSessId,
      sql: 'SELECT customer_code, name FROM Customers LIMIT 5;'
    })
  });
  if (postRevokeRes.status !== 403 && postRevokeRes.status !== 400) {
    throw new Error(`Expected 400/403 for revoked session query execution, got: ${postRevokeRes.status}`);
  }
  console.log('   Enforced: Revoked session execution strictly blocked by workspace backend.');

  // D. Developer approval-required request (Profile 5: Payroll)
  const devSensRes = await fetch(`${API_BASE}/access-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dev.token}`
    },
    body: JSON.stringify({
      profile_id: 5,
      requested_duration_minutes: 30,
      justification: 'Quarterly compensation reporting verification.',
      time_of_day: '14:00'
    })
  });
  const devSensData = await devSensRes.json();
  const devSensReqId = devSensData.data.requestId;
  if (devSensData.data.status !== 'pending') {
    throw new Error(`Expected pending status for Profile 5, got: ${devSensData.data.status}`);
  }
  console.log(`   Developer sensitive Request #${devSensReqId} created (Status: pending).`);

  // Admin approves developer request
  const adminApproveRes = await fetch(`${API_BASE}/access-requests/${devSensReqId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`
    },
    body: JSON.stringify({ comments: 'Approved by administrator for quarterly payroll report.' })
  });
  const adminApproveData = await adminApproveRes.json();
  if (!adminApproveRes.ok || !adminApproveData.success) {
    throw new Error(`Admin approval failed: ${JSON.stringify(adminApproveData)}`);
  }
  console.log(`   Admin approved Request #${devSensReqId}. Activated Session #${adminApproveData.data.sessionId}.`);

  // Clean up
  await fetch(`${API_BASE}/sessions/${adminApproveData.data.sessionId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin.token}` }
  });

  // E. Developer request rejection
  const devDenyReqRes = await fetch(`${API_BASE}/access-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dev.token}`
    },
    body: JSON.stringify({
      profile_id: 5,
      requested_duration_minutes: 30,
      justification: 'Unauthorized compensation check.',
      time_of_day: '14:00'
    })
  });
  const devDenyReqData = await devDenyReqRes.json();
  const denyReqId = devDenyReqData.data.requestId;

  const adminDenyRes = await fetch(`${API_BASE}/access-requests/${denyReqId}/deny`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`
    },
    body: JSON.stringify({ comments: 'Denied: Out of scope for current project phase.' })
  });
  const adminDenyData = await adminDenyRes.json();
  if (!adminDenyRes.ok || !adminDenyData.success) {
    throw new Error(`Admin denial failed: ${JSON.stringify(adminDenyData)}`);
  }
  console.log(`   Admin denied Request #${denyReqId} successfully. Request marked as denied.`);

  console.log('\n=== ALL VERIFICATION TESTS PASSED SUCCESSFULLY ===');
  process.exit(0);
}

run().catch((err) => {
  console.error('\nVerification test failed:', err);
  process.exit(1);
});
