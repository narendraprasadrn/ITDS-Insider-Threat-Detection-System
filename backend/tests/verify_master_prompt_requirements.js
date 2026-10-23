// backend/tests/verify_master_prompt_requirements.js
/**
 * Master Prompt Acceptance Test Suite
 * Verifies all 17 requirements of ITDS Master Prompt:
 * 1. Admin direct workspace execution (without JIT session)
 * 2. Admin destructive DDL pre-execution block (DROP TABLE Customers)
 * 3. Admin system schema pre-execution block (SELECT * FROM mysql.user)
 * 4. Developer routine profile auto-provisioning
 * 5. Developer bounded in-scope query execution (Products, Customers)
 * 6. Developer unbounded query pre-execution block (SELECT * FROM Customers)
 * 7. Developer single-table out-of-scope block (SELECT * FROM Employees)
 * 8. Developer critical table out-of-scope block (SELECT * FROM Payroll)
 * 9. Multi-table query pre-execution block (JOIN with ungranted table)
 * 10. Table-level access request creation (Employees)
 * 11. Self-approval strict prohibition (403 FORBIDDEN_SELF_APPROVAL)
 * 12. DBA approval of operational table request
 * 13. Dynamic grant attachment (querying newly approved table succeeds)
 * 14. Remaining inaccessible tables continue to be blocked
 * 15. Tiered approval hierarchy: DBA cannot approve critical tables (403 FORBIDDEN_APPROVAL_TIER)
 * 16. Admin approves critical table request
 * 17. Authenticated resource catalog endpoint access (Developer can read catalog)
 */

// Use Node 22 built-in global fetch

const BASE_URL = 'http://localhost:5000';

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

async function runAcceptanceTests() {
  console.log('\n===============================================================');
  console.log('   ITDS MASTER PROMPT COMPREHENSIVE ACCEPTANCE TEST SUITE   ');
  console.log('===============================================================\n');

  // 1. Authenticate Personas
  console.log('--> Step 1: Authenticating User Personas');
  const adminToken = await login('admin', 'Password123!');
  const dbaToken = await login('dba', 'Password123!');
  const devToken = await login('developer', 'Password123!');
  assert(adminToken && dbaToken && devToken, 'Successfully authenticated Admin, DBA, and Developer personas');

  // 2. Admin Workspace Direct Execution
  console.log('\n--> Step 2: Verifying Admin Direct Execution (No JIT Session Needed)');
  const adminQueryRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      session_id: 'admin',
      sql: 'SELECT customer_code, name, credit_limit FROM Customers LIMIT 5;'
    })
  });
  const adminQueryData = await adminQueryRes.json();
  assert(adminQueryRes.status === 200 && adminQueryData.success === true, 'Admin executes in workspace without JIT session');
  assert(adminQueryData.data.rowCount > 0 && adminQueryData.data.outcome === 'ALLOWED', `Admin query returned ${adminQueryData.data.rowCount} rows`);

  // 3. Admin Security Policy Enforcement (Destructive DDL Pre-Execution Block)
  console.log('\n--> Step 3: Verifying Admin Destructive DDL Pre-Execution Block');
  const adminDropRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      session_id: 'admin',
      sql: 'DROP TABLE Customers;'
    })
  });
  const adminDropData = await adminDropRes.json();
  assert(adminDropRes.status === 403, 'Admin DROP TABLE Customers blocked with HTTP 403');
  assert(adminDropData.data.blocked === true, 'Admin DROP TABLE pre-emptively blocked before MySQL execution');
  assert(adminDropData.data.rowCount === 0, 'Zero rows executed or returned for blocked DROP statement');
  assert(adminDropData.data.rule === 'PROHIBITED_DESTRUCTIVE_DDL', `Policy rule triggered: ${adminDropData.data.rule}`);

  // 4. Admin System Schema Pre-Execution Block
  console.log('\n--> Step 4: Verifying Admin System Schema Access Block');
  const adminSysRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      session_id: 'admin',
      sql: 'SELECT * FROM mysql.user;'
    })
  });
  const adminSysData = await adminSysRes.json();
  assert(adminSysRes.status === 403, 'Admin SELECT FROM mysql.user blocked with HTTP 403');
  assert(adminSysData.data.blocked === true && adminSysData.data.rowCount === 0, 'Internal system schema query blocked pre-execution');

  // 5. Developer Routine Profile Auto-Provisioning
  console.log('\n--> Step 5: Provisioning Developer JIT Session');
  const devReqRes = await fetch(`${BASE_URL}/api/access-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      profile_id: 1, // Developer Read Profile
      requested_duration_minutes: 60,
      justification: 'Automated test suite least-privilege verification session'
    })
  });
  const devReqData = await devReqRes.json();
  const devSessionId = devReqData.data.sessionId || devReqData.data.requestId;
  assert(devReqRes.status === 201 && devReqData.data.status === 'active', `Developer routine profile auto-provisioned session #${devSessionId}`);

  // 6. Developer Bounded In-Scope Query Execution
  console.log('\n--> Step 6: Verifying Developer Bounded In-Scope Queries');
  const devGoodQueryRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: devSessionId,
      sql: 'SELECT product_code, product_name, price FROM Products LIMIT 5;'
    })
  });
  const devGoodQueryData = await devGoodQueryRes.json();
  if (!devGoodQueryRes.ok) {
    console.error('devGoodQueryData error:', devGoodQueryRes.status, devGoodQueryData);
  }
  assert(devGoodQueryRes.status === 200 && devGoodQueryData.success === true, 'Developer bounded read on Products allowed');
  assert(devGoodQueryData.data.rowCount > 0, `Returned ${devGoodQueryData.data.rowCount} real rows`);

  // 7. Developer Unbounded Query Block
  console.log('\n--> Step 7: Verifying Developer Unbounded Bulk Read Block');
  const devUnboundedRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: devSessionId,
      sql: 'SELECT * FROM Customers;'
    })
  });
  const devUnboundedData = await devUnboundedRes.json();
  assert(devUnboundedRes.status === 403, 'Developer SELECT * FROM Customers without LIMIT blocked with HTTP 403');
  assert(devUnboundedData.data.blocked === true && devUnboundedData.data.rowCount === 0, 'Zero rows returned for unbounded read');
  assert(devUnboundedData.data.rule === 'UNBOUNDED_BULK_READ', `Blocked by rule: ${devUnboundedData.data.rule}`);

  // 8. Developer Out-of-Scope Single-Table Block
  console.log('\n--> Step 8: Verifying Developer Out-of-Scope Single-Table Block (Employees)');
  const devEmpRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: devSessionId,
      sql: 'SELECT * FROM Employees LIMIT 5;'
    })
  });
  const devEmpData = await devEmpRes.json();
  assert(devEmpRes.status === 403, 'Developer query on ungranted table Employees blocked with HTTP 403');
  assert(devEmpData.data.blocked === true, 'Out-of-scope table access blocked pre-execution');
  assert(devEmpData.data.rule === 'TABLE_OUT_OF_SCOPE', `Blocked by rule: ${devEmpData.data.rule}`);

  // 9. Developer Out-of-Scope Critical Table Block
  console.log('\n--> Step 9: Verifying Developer Out-of-Scope Critical Table Block (Payroll)');
  const devPayRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: devSessionId,
      sql: 'SELECT * FROM Payroll LIMIT 5;'
    })
  });
  const devPayData = await devPayRes.json();
  assert(devPayRes.status === 403, 'Developer query on critical table Payroll blocked with HTTP 403');
  assert(devPayData.data.blocked === true && devPayData.data.rowCount === 0, 'Zero rows returned for sensitive Payroll table');

  // 10. Multi-Table Query Joint Verification (JOIN with out-of-scope table)
  console.log('\n--> Step 10: Verifying Multi-Table Join Policy Enforcement');
  const devJoinRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: devSessionId,
      sql: 'SELECT c.name, e.name AS emp_name FROM Customers c JOIN Employees e ON c.id = e.id;'
    })
  });
  const devJoinData = await devJoinRes.json();
  assert(devJoinRes.status === 403, 'Multi-table join referencing inaccessible table Employees blocked with HTTP 403');
  assert(devJoinData.data.blocked === true && devJoinData.data.rowCount === 0, 'Zero rows returned for multi-table join');

  // 11. Table-Level Access Request Creation
  console.log('\n--> Step 11: Developer Submitting Table-Level Access Request for Employees');
  const tableReqRes = await fetch(`${BASE_URL}/api/access-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      request_type: 'table',
      target_table: 'Employees',
      operations: ['SELECT'],
      requested_duration_minutes: 60,
      justification: 'Engineering team needs read access to employee directory for directory sync integration'
    })
  });
  const tableReqData = await tableReqRes.json();
  const tableReqId = tableReqData.data.requestId;
  assert(tableReqRes.status === 200 && tableReqData.data.status === 'pending', `Table-level request #${tableReqId} created with status pending`);
  assert(tableReqData.data.target_table === 'Employees', 'Request accurately captures target table Employees');

  // 12. Self-Approval Strict Prohibition
  console.log('\n--> Step 12: Verifying Self-Approval Prohibition');
  // First verify developer cannot approve any request (role restriction)
  const devApproveRes = await fetch(`${BASE_URL}/api/access-requests/${tableReqId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({ comments: 'Developer attempting approval' })
  });
  assert(devApproveRes.status === 403, 'Developer approval attempt rejected with HTTP 403');

  // Next verify elevated approver (DBA) cannot approve their own request
  const dbaSelfReqRes = await fetch(`${BASE_URL}/api/access-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dbaToken}` },
    body: JSON.stringify({
      request_type: 'table',
      target_table: 'Payroll',
      operations: ['SELECT'],
      requested_duration_minutes: 60,
      justification: 'DBA attempting self-request and self-approval',
      time_of_day: '10:00'
    })
  });
  const dbaSelfReqData = await dbaSelfReqRes.json();
  const dbaSelfReqId = dbaSelfReqData.data.requestId;

  const dbaSelfApproveRes = await fetch(`${BASE_URL}/api/access-requests/${dbaSelfReqId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dbaToken}` },
    body: JSON.stringify({ comments: 'DBA attempting self-approval' })
  });
  const dbaSelfApproveData = await dbaSelfApproveRes.json();
  assert(dbaSelfApproveRes.status === 403, 'DBA self-approval attempt rejected with HTTP 403');
  assert(dbaSelfApproveData.error?.code === 'FORBIDDEN_SELF_APPROVAL', `Self-approval blocked with code: ${dbaSelfApproveData.error?.code}`);

  // 13. DBA Approval of Operational Table Request
  console.log('\n--> Step 13: DBA Approving Operational Table Request');
  const dbaApproveRes = await fetch(`${BASE_URL}/api/access-requests/${tableReqId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dbaToken}` },
    body: JSON.stringify({ comments: 'Approved by DBA for directory integration test' })
  });
  const dbaApproveData = await dbaApproveRes.json();
  assert(dbaApproveRes.status === 200 && dbaApproveData.data.success === true, 'DBA successfully approved Employees table request');
  assert(dbaApproveData.data.attached_to_existing_session === true, 'Dynamically attached table grant to existing active session');

  // 14. Querying Newly Approved Table Now Succeeds Immediately
  console.log('\n--> Step 14: Verifying Query on Newly Approved Table Succeeds');
  const devEmpApprovedRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: devSessionId,
      sql: 'SELECT employee_code, name, department FROM Employees LIMIT 5;'
    })
  });
  const devEmpApprovedData = await devEmpApprovedRes.json();
  assert(devEmpApprovedRes.status === 200 && devEmpApprovedData.success === true, 'Developer query on newly approved Employees table SUCCEEDS immediately');
  assert(devEmpApprovedData.data.rowCount > 0, `Returned ${devEmpApprovedData.data.rowCount} real rows from Employees`);

  // 15. Remaining Inaccessible Tables Continue to Be Blocked
  console.log('\n--> Step 15: Verifying Remaining Inaccessible Tables (Payroll) Remain Blocked');
  const devPayStillBlockedRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: devSessionId,
      sql: 'SELECT * FROM Payroll LIMIT 5;'
    })
  });
  const devPayStillBlockedData = await devPayStillBlockedRes.json();
  assert(devPayStillBlockedRes.status === 403 && devPayStillBlockedData.data.blocked === true, 'Unapproved table Payroll remains strictly blocked');

  // 16. Tiered Approval Hierarchy: DBA Cannot Approve Critical Table Request
  console.log('\n--> Step 16: Verifying Tiered Approval Authority (DBA Cannot Approve Critical Table)');
  const critReqRes = await fetch(`${BASE_URL}/api/access-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      request_type: 'table',
      target_table: 'Payroll',
      operations: ['SELECT'],
      requested_duration_minutes: 60,
      justification: 'Quarterly compliance reconciliation check'
    })
  });
  const critReqData = await critReqRes.json();
  const critReqId = critReqData.data.requestId;

  // DBA attempts to approve critical Payroll table request
  const dbaCritApproveRes = await fetch(`${BASE_URL}/api/access-requests/${critReqId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dbaToken}` },
    body: JSON.stringify({ comments: 'DBA approval attempt on critical resource' })
  });
  const dbaCritApproveData = await dbaCritApproveRes.json();
  assert(dbaCritApproveRes.status === 403, 'DBA approval of critical table Payroll rejected with HTTP 403');
  assert(dbaCritApproveData.error?.code === 'FORBIDDEN_APPROVAL_TIER', `DBA approval blocked with code: ${dbaCritApproveData.error?.code}`);

  // Admin approves critical Payroll table request
  console.log('\n--> Step 17: Admin Approves Critical Table Request');
  const adminCritApproveRes = await fetch(`${BASE_URL}/api/access-requests/${critReqId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ comments: 'Authorized by Security Administrator under compliance ticket #8841' })
  });
  const adminCritApproveData = await adminCritApproveRes.json();
  assert(adminCritApproveRes.status === 200 && adminCritApproveData.data.success === true, 'Admin successfully approved Payroll table request');

  // Developer can now query Payroll
  const devPayNowAllowedRes = await fetch(`${BASE_URL}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
    body: JSON.stringify({
      session_id: devSessionId,
      sql: 'SELECT employee_id, salary_amount, bonus_amount FROM Payroll LIMIT 3;'
    })
  });
  const devPayNowAllowedData = await devPayNowAllowedRes.json();
  assert(devPayNowAllowedRes.status === 200 && devPayNowAllowedData.success === true, 'Developer now successfully queries approved Payroll table');

  // 18. Authenticated Resource Catalog Transparency
  console.log('\n--> Step 18: Verifying Resource Catalog Accessibility for All Authenticated Personas');
  const devCatalogRes = await fetch(`${BASE_URL}/api/resources`, {
    headers: { Authorization: `Bearer ${devToken}` }
  });
  const devCatalogData = await devCatalogRes.json();
  assert(devCatalogRes.status === 200 && devCatalogData.success === true, 'Developer can read database resource catalog');
  assert(devCatalogData.data.resources.length === 10, `Retrieved ${devCatalogData.data.resources.length} catalog tables`);

  console.log('\n===============================================================');
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED   `);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAcceptanceTests().catch(err => {
  console.error('Fatal error running acceptance tests:', err);
  process.exit(1);
});
