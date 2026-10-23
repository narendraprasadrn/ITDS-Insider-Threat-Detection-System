// backend/tests/verify_single_active_session_and_sql_auth.js
/**
 * Automated Verification Suite for:
 * 1. Single Active JIT Session Per User & Safe Replacement
 * 2. Pre-Execution Policy Enforcement & Unbounded Read on Authorized Tables
 *
 * Covers all 12 test requirements from the Antigravity Master Prompt:
 * 1. A user cannot have two active JIT sessions simultaneously.
 * 2. Choosing Continue with Existing Session preserves the original session.
 * 3. Choosing Replace Existing Session safely replaces the old session.
 * 4. Cancelling replacement leaves the old session active.
 * 5. Failed replacement does not leave the user without a valid session.
 * 6. Concurrent session-creation requests cannot create duplicate active sessions.
 * 7. SELECT * on an authorized table succeeds without a mandatory LIMIT clause.
 * 8. SELECT * on a restricted table is blocked before execution.
 * 9. Authorized SELECT does not grant unauthorized DELETE or DDL privileges.
 * 10. Multi-table queries are checked against every referenced table.
 * 11. Expired or revoked sessions cannot execute queries.
 * 12. Audit events accurately represent the real execution and enforcement outcome.
 */

const BASE_URL = 'http://localhost:5000';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function login(username, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${username}: ${data.error?.message}`);
  return data.data.accessToken;
}

async function runTests() {
  console.log('\n========================================================================');
  console.log('   ITDS SINGLE ACTIVE SESSION & SQL AUTHORIZATION VERIFICATION SUITE   ');
  console.log('========================================================================\n');

  // Authenticate Developer persona
  console.log('--> Step 1: Authenticating Developer Persona');
  const devToken = await login('developer', 'Password123!');
  assert(Boolean(devToken), 'Developer authentication successful');

  // Check Developer's current active sessions
  const mySessRes = await fetch(`${BASE_URL}/api/sessions/my`, {
    headers: { Authorization: `Bearer ${devToken}` }
  });
  const mySessData = await mySessRes.json();
  let activeSessions = (mySessData.data?.sessions || []).filter(s => s.status === 'active' && new Date(s.end_time) > new Date());

  // Ensure Developer starts with exactly 1 active session (Profile 1: Developer Read Profile)
  if (activeSessions.length === 0) {
    console.log('--> Provisioning initial routine active session for Developer');
    const initRes = await fetch(`${BASE_URL}/api/access-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({ profile_id: 1, requested_duration_minutes: 60 })
    });
    const initData = await initRes.json();
    assert(initRes.ok && initData.data?.sessionId, 'Initial Developer routine session activated');
  }

  // Refresh active sessions
  const refRes = await fetch(`${BASE_URL}/api/sessions/my`, { headers: { Authorization: `Bearer ${devToken}` } });
  const refData = await refRes.json();
  activeSessions = (refData.data?.sessions || []).filter(s => s.status === 'active' && new Date(s.end_time) > new Date());
  assert(activeSessions.length === 1, `Developer has exactly 1 active session (#${activeSessions[0]?.id})`);

  const initialSessionId = activeSessions[0]?.id;

  // ------------------------------------------------------------------------
  // Test 1: A user cannot have two active JIT sessions simultaneously
  // ------------------------------------------------------------------------
  console.log('\n--> Test 1: User cannot create a second active JIT session simultaneously');
  const conflictRes = await fetch(`${BASE_URL}/api/access-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({ profile_id: 2, requested_duration_minutes: 60, replace_existing: false })
  });
  const conflictData = await conflictRes.json();

  assert(conflictRes.status === 409, `Server rejected duplicate session request with HTTP 409 Conflict (got ${conflictRes.status})`);
  assert(conflictData.error?.code === 'ACTIVE_SESSION_EXISTS', `Error code is ACTIVE_SESSION_EXISTS (got ${conflictData.error?.code})`);
  assert(conflictData.error?.existingSession?.id === initialSessionId, `Response includes existingSession (#${conflictData.error?.existingSession?.id}) details`);

  // ------------------------------------------------------------------------
  // Test 2: Choosing Continue with Existing Session preserves the original session
  // ------------------------------------------------------------------------
  console.log('\n--> Test 2: Continuing with existing session leaves original session intact');
  const contCheckRes = await fetch(`${BASE_URL}/api/sessions/my`, { headers: { Authorization: `Bearer ${devToken}` } });
  const contCheckData = await contCheckRes.json();
  const contActives = (contCheckData.data?.sessions || []).filter(s => s.status === 'active' && new Date(s.end_time) > new Date());

  assert(contActives.length === 1, `Active session count remains strictly 1`);
  assert(contActives[0]?.id === initialSessionId, `Original session #${initialSessionId} remains active and unchanged`);

  // ------------------------------------------------------------------------
  // Test 3: Choosing Replace Existing Session safely replaces the old session
  // ------------------------------------------------------------------------
  console.log('\n--> Test 3: Replacing existing session safely revokes old and activates new');
  const replaceRes = await fetch(`${BASE_URL}/api/access-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({ profile_id: 1, requested_duration_minutes: 60, replace_existing: true })
  });
  const replaceData = await replaceRes.json();

  assert(replaceRes.status === 201 || replaceRes.status === 200, `Replacement request succeeded with status ${replaceRes.status}`);
  const newSessionId = replaceData.data?.sessionId;
  assert(Boolean(newSessionId) && newSessionId !== initialSessionId, `New session #${newSessionId} activated (replaced #${initialSessionId})`);

  // Verify DB state: old session must be 'revoked', new session must be 'active'
  const postReplaceRes = await fetch(`${BASE_URL}/api/sessions/my`, { headers: { Authorization: `Bearer ${devToken}` } });
  const postReplaceData = await postReplaceRes.json();
  const postActives = (postReplaceData.data?.sessions || []).filter(s => s.status === 'active' && new Date(s.end_time) > new Date());

  assert(postActives.length === 1, `Developer still has strictly 1 active session (#${postActives[0]?.id})`);
  assert(postActives[0]?.id === newSessionId, `Active session is now #${newSessionId}`);

  const oldSessDetail = (postReplaceData.data?.sessions || []).find(s => s.id === initialSessionId);
  assert(oldSessDetail?.status === 'revoked', `Old session #${initialSessionId} status transitioned to 'revoked'`);

  // ------------------------------------------------------------------------
  // Test 4: Cancelling replacement leaves the old session active
  // ------------------------------------------------------------------------
  console.log('\n--> Test 4: Cancelling replacement leaves current active session untouched');
  // Attempt duplicate request without replace_existing -> rejected
  const cancelAttemptRes = await fetch(`${BASE_URL}/api/access-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({ profile_id: 2, requested_duration_minutes: 60, replace_existing: false })
  });
  assert(cancelAttemptRes.status === 409, 'Attempt rejected without replacement confirmation');

  // Verify session #newSessionId is still active
  const cancelCheckRes = await fetch(`${BASE_URL}/api/sessions/my`, { headers: { Authorization: `Bearer ${devToken}` } });
  const cancelCheckData = await cancelCheckRes.json();
  const cancelActives = (cancelCheckData.data?.sessions || []).filter(s => s.status === 'active' && new Date(s.end_time) > new Date());
  assert(cancelActives.length === 1 && cancelActives[0].id === newSessionId, `Session #${newSessionId} remains safely active`);

  // ------------------------------------------------------------------------
  // Test 5: Failed replacement does not leave the user without a valid session
  // ------------------------------------------------------------------------
  console.log('\n--> Test 5: Failed replacement preserves the user’s existing active session');
  // Send request with an invalid/non-existent profile ID with replace_existing: true
  const failReplaceRes = await fetch(`${BASE_URL}/api/access-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({ profile_id: 99999, requested_duration_minutes: 60, replace_existing: true })
  });
  assert(!failReplaceRes.ok, `Invalid profile request rejected with status ${failReplaceRes.status}`);

  // Current session must still be active
  const failCheckRes = await fetch(`${BASE_URL}/api/sessions/my`, { headers: { Authorization: `Bearer ${devToken}` } });
  const failCheckData = await failCheckRes.json();
  const failActives = (failCheckData.data?.sessions || []).filter(s => s.status === 'active' && new Date(s.end_time) > new Date());
  assert(failActives.length === 1 && failActives[0].id === newSessionId, `Existing session #${newSessionId} remains safely active despite failed replacement attempt`);

  // ------------------------------------------------------------------------
  // Test 6: Concurrent session-creation requests cannot create duplicate active sessions
  // ------------------------------------------------------------------------
  console.log('\n--> Test 6: Concurrent session-creation requests strictly maintain single active session');
  const concurrentCalls = [
    fetch(`${BASE_URL}/api/access-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({ profile_id: 1, requested_duration_minutes: 30, replace_existing: true })
    }),
    fetch(`${BASE_URL}/api/access-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({ profile_id: 1, requested_duration_minutes: 45, replace_existing: true })
    }),
    fetch(`${BASE_URL}/api/access-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({ profile_id: 1, requested_duration_minutes: 60, replace_existing: false })
    })
  ];

  const concurrentResults = await Promise.all(concurrentCalls);
  const statusCodes = concurrentResults.map(r => r.status);
  console.log(`    Concurrent responses status codes: [${statusCodes.join(', ')}]`);

  // Check database after concurrent storm
  const concCheckRes = await fetch(`${BASE_URL}/api/sessions/my`, { headers: { Authorization: `Bearer ${devToken}` } });
  const concCheckData = await concCheckRes.json();
  const concActives = (concCheckData.data?.sessions || []).filter(s => s.status === 'active' && new Date(s.end_time) > new Date());

  assert(concActives.length === 1, `After concurrent requests, user has strictly 1 active session (#${concActives[0]?.id})`);
  const currentDevSessionId = concActives[0].id;

  // ------------------------------------------------------------------------
  // Test 7: SELECT * on an authorized table succeeds without a mandatory LIMIT clause
  // ------------------------------------------------------------------------
  console.log('\n--> Test 7: SELECT * on an authorized table succeeds without a mandatory LIMIT clause');
  const selectStarRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: currentDevSessionId,
      sql: 'SELECT * FROM Products;'
    })
  });
  const selectStarData = await selectStarRes.json();

  assert(selectStarRes.ok, `Query executed successfully with status 200 (got ${selectStarRes.status})`);
  assert(selectStarData.data?.blocked === false, 'Query was NOT blocked by security policy');
  assert(selectStarData.data?.outcome === 'ALLOWED', `Outcome is ALLOWED (got ${selectStarData.data?.outcome})`);
  assert(selectStarData.data?.rowCount > 0, `Returned ${selectStarData.data?.rowCount} rows for SELECT * FROM Products without LIMIT clause`);

  // Also verify with LIMIT clause
  const selectLimitRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: currentDevSessionId,
      sql: 'SELECT * FROM Products LIMIT 5;'
    })
  });
  const selectLimitData = await selectLimitRes.json();
  assert(selectLimitRes.ok && selectLimitData.data?.rowCount === 5, 'SELECT * FROM Products LIMIT 5 returned 5 rows');

  // ------------------------------------------------------------------------
  // Test 8: SELECT * on a restricted table is blocked before execution
  // ------------------------------------------------------------------------
  console.log('\n--> Test 8: SELECT * on a restricted table (Payroll) is blocked before execution');
  const restrictedRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: currentDevSessionId,
      sql: 'SELECT * FROM Payroll;'
    })
  });
  const restrictedData = await restrictedRes.json();

  assert(restrictedRes.status === 403, `Restricted table access blocked with HTTP 403 (got ${restrictedRes.status})`);
  assert(restrictedData.data?.blocked === true, 'Query blocked flag is true');
  assert(restrictedData.data?.outcome === 'BLOCKED PRE-EXECUTION', `Outcome is BLOCKED PRE-EXECUTION (got ${restrictedData.data?.outcome})`);
  assert(restrictedData.data?.rule === 'TABLE_OUT_OF_SCOPE', `Violated rule is TABLE_OUT_OF_SCOPE (got ${restrictedData.data?.rule})`);
  assert(restrictedData.data?.rowCount === 0 && restrictedData.data?.rows?.length === 0, 'Zero rows returned for restricted table');

  // ------------------------------------------------------------------------
  // Test 9: Authorized SELECT does not grant unauthorized DELETE or DDL privileges
  // ------------------------------------------------------------------------
  console.log('\n--> Test 9: Authorized SELECT does not grant unauthorized DELETE or DDL privileges');
  // Attempt DELETE
  const deleteRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: currentDevSessionId,
      sql: 'DELETE FROM Products WHERE id = 1;'
    })
  });
  const deleteData = await deleteRes.json();

  assert(deleteRes.status === 403, `DELETE query blocked with HTTP 403 (got ${deleteRes.status})`);
  assert(deleteData.data?.blocked === true, 'DELETE blocked flag is true');
  assert(deleteData.data?.rule === 'OPERATION_NOT_GRANTED', `Violated rule is OPERATION_NOT_GRANTED (got ${deleteData.data?.rule})`);
  assert(deleteData.data?.rowCount === 0, 'Zero rows affected/returned for blocked DELETE');

  // Attempt DDL DROP
  const ddlRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: currentDevSessionId,
      sql: 'DROP TABLE Customers;'
    })
  });
  const ddlData = await ddlRes.json();

  assert(ddlRes.status === 403, `DROP TABLE blocked with HTTP 403 (got ${ddlRes.status})`);
  assert(ddlData.data?.blocked === true, 'DROP TABLE blocked flag is true');
  assert(
    ddlData.data?.rule === 'PROHIBITED_DESTRUCTIVE_DDL' || ddlData.data?.rule === 'UNAUTHORIZED_DDL',
    `Violated rule is destructive/unauthorized DDL (got ${ddlData.data?.rule})`
  );

  // ------------------------------------------------------------------------
  // Test 10: Multi-table queries are checked against every referenced table
  // ------------------------------------------------------------------------
  console.log('\n--> Test 10: Multi-table query referencing unauthorized table is blocked pre-execution');
  const multiTableRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: currentDevSessionId,
      sql: 'SELECT c.name, e.first_name FROM Customers c JOIN Employees e ON c.id = e.id;'
    })
  });
  const multiTableData = await multiTableRes.json();

  assert(multiTableRes.status === 403, `Multi-table query blocked with HTTP 403 (got ${multiTableRes.status})`);
  assert(multiTableData.data?.blocked === true, 'Multi-table query blocked flag is true');
  assert(multiTableData.data?.rule === 'TABLE_OUT_OF_SCOPE', `Violated rule is TABLE_OUT_OF_SCOPE (got ${multiTableData.data?.rule})`);
  assert(multiTableData.data?.rowCount === 0, 'Zero rows returned for multi-table out-of-scope query');

  // ------------------------------------------------------------------------
  // Test 11: Expired or revoked sessions cannot execute queries
  // ------------------------------------------------------------------------
  console.log('\n--> Test 11: Revoked session cannot execute queries');
  const revokedRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: initialSessionId, // This session was revoked in Test 3
      sql: 'SELECT * FROM Products LIMIT 1;'
    })
  });
  const revokedData = await revokedRes.json();

  assert(revokedRes.status === 403, `Revoked session query blocked with HTTP 403 (got ${revokedRes.status})`);
  assert(revokedData.data?.blocked === true, 'Revoked session blocked flag is true');
  assert(revokedData.data?.rule === 'SESSION_EXPIRED', `Rule is SESSION_EXPIRED (got ${revokedData.data?.rule})`);
  assert(revokedData.data?.rowCount === 0, 'Zero rows returned for revoked session');

  // ------------------------------------------------------------------------
  // Test 12: Audit events accurately represent the real execution and enforcement outcome
  // ------------------------------------------------------------------------
  console.log('\n--> Test 12: Verifying persisted audit logs represent genuine events');
  const adminToken = await login('admin', 'Password123!');
  // Query db audit_log directly via db pool import or API
  const { pool } = await import('../src/db/pool.js');
  const [auditRows] = await pool.query(
    `SELECT event_type, status, details FROM audit_log WHERE user_id = 3 ORDER BY id DESC LIMIT 20`
  );

  const eventTypes = auditRows.map(r => r.event_type);
  console.log(`    Recent Developer audit event types: [${[...new Set(eventTypes)].join(', ')}]`);

  assert(eventTypes.includes('ACCESS_REQUEST_ACTIVATED'), 'Audit log contains ACCESS_REQUEST_ACTIVATED event');
  assert(eventTypes.includes('SESSION_REVOKED'), 'Audit log contains SESSION_REVOKED event for replaced session');
  assert(eventTypes.includes('SQL_EXECUTED'), 'Audit log contains SQL_EXECUTED event for authorized query');
  assert(eventTypes.includes('SQL_BLOCKED_BY_POLICY'), 'Audit log contains SQL_BLOCKED_BY_POLICY event for blocked queries');

  console.log('\n========================================================================');
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
