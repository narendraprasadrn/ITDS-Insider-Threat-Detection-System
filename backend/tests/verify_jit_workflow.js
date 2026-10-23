// backend/tests/verify_jit_workflow.js
import mysql from 'mysql2/promise';
import { pool } from '../src/db/pool.js';

async function runJitVerification() {
  console.log('=== ITDS JIT ACCESS WORKFLOW VERIFICATION SUITE ===\n');

  // Step 1: Login all 3 personas
  console.log('1. Authenticating Admin, DBA, and Developer personas...');
  const adminLogin = await (await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Password123!' })
  })).json();

  const dbaLogin = await (await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dba', password: 'Password123!' })
  })).json();

  const devLogin = await (await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'developer', password: 'Password123!' })
  })).json();

  if (!adminLogin.success || !dbaLogin.success || !devLogin.success) {
    throw new Error('Authentication failed for one or more personas');
  }

  const adminToken = adminLogin.data.accessToken;
  const dbaToken = dbaLogin.data.accessToken;
  const devToken = devLogin.data.accessToken;
  console.log('   All 3 personas authenticated successfully.\n');

  // --------------------------------------------------------------------------
  // Scenario 1: Admin Activation with Auto-Approved Routine Profile (Profile 7)
  // --------------------------------------------------------------------------
  console.log('2. Scenario 1: Admin Instant Activation with Auto-Approved Profile (Profile 7)...');
  const adminActRes = await fetch('http://localhost:5000/api/access-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      profile_id: 7,
      requested_duration_minutes: 30
      // Note: justification omitted to verify optional justification on routine activation
    })
  });

  const adminActData = await adminActRes.json();
  if (!adminActData.success) {
    throw new Error('Admin activation failed: ' + JSON.stringify(adminActData));
  }

  console.log(`   Response status: ${adminActData.data.status}`);
  console.log(`   Session created: #${adminActData.data.sessionId}`);
  console.log(`   Ephemeral MySQL User: ${adminActData.data.credentials?.username}`);

  if (adminActData.data.status !== 'active') {
    throw new Error(`Expected status 'active', received '${adminActData.data.status}'`);
  }
  if (!adminActData.data.credentials?.password) {
    throw new Error('No credentials returned for auto-approved session');
  }

  // Verify least-privilege connection with provisioned MySQL user
  const adminConn = await mysql.createConnection({
    host: adminActData.data.credentials.host,
    port: adminActData.data.credentials.port,
    user: adminActData.data.credentials.username,
    password: adminActData.data.credentials.password,
    database: adminActData.data.credentials.database
  });
  const [testRows] = await adminConn.query('SELECT 1 as test');
  if (testRows[0].test !== 1) throw new Error('Could not execute query with JIT credentials');
  await adminConn.end();
  console.log('   Verified: JIT MySQL connection successful and operational.');

  // Clean up admin session
  await fetch(`http://localhost:5000/api/sessions/${adminActData.data.sessionId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log('   Admin session revoked cleanly.\n');

  // --------------------------------------------------------------------------
  // Scenario 2: Profile Requiring Independent Approval & Self-Approval Prevention
  // --------------------------------------------------------------------------
  console.log('3. Scenario 2: Independent Approval Workflow & Self-Approval Prevention...');
  // Admin requests Profile 4 (DBA Maintenance Profile - requires approval)
  const indepReqRes = await fetch('http://localhost:5000/api/access-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      profile_id: 4,
      requested_duration_minutes: 45,
      justification: 'Scheduled database maintenance, table partition optimization and index rebuild'
    })
  });

  const indepReqData = await indepReqRes.json();
  if (!indepReqData.success || indepReqData.data.status !== 'pending') {
    throw new Error('Expected pending status for approval-required profile: ' + JSON.stringify(indepReqData));
  }
  const pendingRequestId = indepReqData.data.requestId;
  console.log(`   Pending request #${pendingRequestId} created for DBA Maintenance Profile.`);

  // Attempt SELF-APPROVAL (Admin attempts to approve own request)
  console.log('   Attempting self-approval by requester (Admin)...');
  const selfApproveRes = await fetch(`http://localhost:5000/api/access-requests/${pendingRequestId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ comments: 'Self-approving my maintenance request' })
  });

  const selfApproveData = await selfApproveRes.json();
  if (selfApproveRes.status !== 403 || selfApproveData.error?.code !== 'FORBIDDEN_SELF_APPROVAL') {
    throw new Error(`Self-approval was NOT blocked! Status: ${selfApproveRes.status}, Body: ${JSON.stringify(selfApproveData)}`);
  }
  console.log('   BLOCKED AS EXPECTED: 403 FORBIDDEN_SELF_APPROVAL — self-approval strictly rejected.');

  // Independent Approval: DBA reviews and approves Admin's request
  console.log('   Independent reviewer (DBA) reviewing and approving request...');
  const dbaApproveRes = await fetch(`http://localhost:5000/api/access-requests/${pendingRequestId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dbaToken}`
    },
    body: JSON.stringify({ comments: 'Verified scheduled maintenance change ticket #CHG-9901' })
  });

  const dbaApproveData = await dbaApproveRes.json();
  if (!dbaApproveData.success || !dbaApproveData.data.credentials) {
    throw new Error('Independent approval failed: ' + JSON.stringify(dbaApproveData));
  }
  console.log(`   Approved successfully by independent reviewer (DBA). JIT Session #${dbaApproveData.data.sessionId} activated.`);

  // Clean up session
  await fetch(`http://localhost:5000/api/sessions/${dbaApproveData.data.sessionId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log('   Session revoked cleanly.\n');

  // --------------------------------------------------------------------------
  // Scenario 3: Role-Specific Restrictions: DBA & Developer Scoping
  // --------------------------------------------------------------------------
  console.log('4. Scenario 3: Enforcing Role Scoping and Access Restrictions...');

  // A. Developer attempts to request Admin Security Administration (Profile 7)
  console.log('   A. Developer attempting to request Admin profile...');
  const devAdminRes = await fetch('http://localhost:5000/api/access-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${devToken}`
    },
    body: JSON.stringify({
      profile_id: 7,
      requested_duration_minutes: 30,
      justification: 'Unauthorized attempt'
    })
  });
  const devAdminData = await devAdminRes.json();
  if (devAdminRes.status !== 403 || devAdminData.error?.code !== 'FORBIDDEN_PROFILE') {
    throw new Error('Developer was not forbidden from Admin profile!');
  }
  console.log('      Blocked: 403 FORBIDDEN_PROFILE — developer denied Admin profile.');

  // B. Developer attempts to approve requests
  console.log('   B. Developer attempting to approve access requests...');
  const devApproveRes = await fetch(`http://localhost:5000/api/access-requests/1/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${devToken}`
    },
    body: JSON.stringify({ comments: 'Developer approval attempt' })
  });
  if (devApproveRes.status !== 403) {
    throw new Error('Developer was not forbidden from approval endpoint!');
  }
  console.log('      Blocked: 403 Forbidden — developer denied approval rights.');

  // C. Developer activates routine Developer Read Profile (Profile 1)
  console.log('   C. Developer activating authorized routine Developer Read Profile (Profile 1)...');
  const devActRes = await fetch('http://localhost:5000/api/access-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${devToken}`
    },
    body: JSON.stringify({
      profile_id: 1,
      requested_duration_minutes: 30
    })
  });
  const devActData = await devActRes.json();
  if (!devActData.success || devActData.data.status !== 'active') {
    throw new Error('Developer routine activation failed: ' + JSON.stringify(devActData));
  }
  console.log(`      Developer JIT Session #${devActData.data.sessionId} activated immediately under Profile 1.`);

  // Verify Developer JIT credentials cannot perform unauthorized writes or DDL
  const devConn = await mysql.createConnection({
    host: devActData.data.credentials.host,
    port: devActData.data.credentials.port,
    user: devActData.data.credentials.username,
    password: devActData.data.credentials.password,
    database: devActData.data.credentials.database
  });

  // Allowed read
  const [devRead] = await devConn.query('SELECT count(*) as count FROM Customers');
  console.log(`      Developer read test: SUCCESS (${devRead[0].count} customers read).`);

  // Denied write
  try {
    await devConn.query("INSERT INTO Customers (company_name) VALUES ('Hacker Corp')");
    throw new Error('Developer was able to INSERT with read-only profile!');
  } catch (permErr) {
    if (permErr.code === 'ER_TABLEACCESS_DENIED_ERROR') {
      console.log('      Developer write test: BLOCKED BY MYSQL GRANTS (ER_TABLEACCESS_DENIED_ERROR).');
    } else {
      throw permErr;
    }
  }

  await devConn.end();

  // Clean up developer session
  await fetch(`http://localhost:5000/api/sessions/${devActData.data.sessionId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log('      Developer session revoked cleanly.\n');

  console.log('=== ALL JIT WORKFLOW VERIFICATION TESTS PASSED SUCCESSFULLY ===');
  process.exit(0);
}

runJitVerification().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
