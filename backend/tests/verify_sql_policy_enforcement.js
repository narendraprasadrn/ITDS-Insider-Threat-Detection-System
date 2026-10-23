// backend/tests/verify_sql_policy_enforcement.js
import axios from 'axios';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const BASE_URL = `http://localhost:${env.PORT || 5000}/api`;

async function runVerification() {
  console.log('================================================================');
  console.log('   ITDS SQL POLICY PRE-EXECUTION ENFORCEMENT VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // Direct DB pool for assertions
  const pool = await mysql.createPool({
    host: env.DB.HOST,
    port: env.DB.PORT,
    user: env.DB.USER,
    password: env.DB.PASSWORD,
    database: env.DB.NAME,
    waitForConnections: true,
    connectionLimit: 5
  });

  try {
    // 1. Authenticate users
    console.log('Step 1: Authenticating test personas (developer, admin)...');
    const devLogin = await axios.post(`${BASE_URL}/auth/login`, {
      username: 'developer',
      password: 'Password123!'
    });
    const devToken = devLogin.data.data.accessToken;
    const devUserId = devLogin.data.data.user.id;
    assert(Boolean(devToken), 'Developer authenticated successfully');

    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      username: 'admin',
      password: 'Password123!'
    });
    const adminToken = adminLogin.data.data.accessToken;
    const adminUserId = adminLogin.data.data.user.id;
    assert(Boolean(adminToken), 'Admin authenticated successfully');

    // 2. Request Developer JIT Session
    console.log('\nStep 2: Activating routine Developer JIT Session (Profile 1: Developer Read Profile)...');
    const devReqRes = await axios.post(
      `${BASE_URL}/access-requests`,
      {
        profile_id: 1, // Developer Read Profile
        requested_duration_minutes: 30,
        justification: 'Automated SQL policy enforcement verification'
      },
      { headers: { Authorization: `Bearer ${devToken}` } }
    );
    const devSessionId = devReqRes.data.data.sessionId;
    assert(Boolean(devSessionId), `Developer JIT session provisioned: Session #${devSessionId}`);

    // 3. Test: Unbounded read SELECT * FROM Customers; on developer session -> MUST BE BLOCKED PRE-EXECUTION
    console.log('\nStep 3: Testing unbounded query: SELECT * FROM Customers; (Developer Profile)...');
    let devUnboundedBlockRes;
    try {
      devUnboundedBlockRes = await axios.post(
        `${BASE_URL}/workspace/execute`,
        {
          session_id: devSessionId,
          sql: 'SELECT * FROM Customers;'
        },
        { headers: { Authorization: `Bearer ${devToken}` } }
      );
    } catch (err) {
      devUnboundedBlockRes = err.response;
    }

    assert(devUnboundedBlockRes.status === 403, 'Unbounded query returned HTTP 403 Forbidden');
    assert(devUnboundedBlockRes.data.success === false, 'Response payload success is false');
    assert(devUnboundedBlockRes.data.data?.blocked === true, 'Response payload blocked is true');
    assert(
      devUnboundedBlockRes.data.data?.outcome === 'BLOCKED PRE-EXECUTION',
      `Response outcome is 'BLOCKED PRE-EXECUTION' (actual: ${devUnboundedBlockRes.data.data?.outcome})`
    );
    assert(
      devUnboundedBlockRes.data.data?.rule === 'UNBOUNDED_BULK_READ',
      `Triggered rule is 'UNBOUNDED_BULK_READ' (actual: ${devUnboundedBlockRes.data.data?.rule})`
    );
    assert(
      devUnboundedBlockRes.data.data?.rows?.length === 0,
      `Zero rows returned for blocked query (rowCount: ${devUnboundedBlockRes.data.data?.rowCount})`
    );
    assert(
      devUnboundedBlockRes.data.data?.explanation?.includes('Unbounded read requires approval or a restrictive LIMIT clause'),
      `Explanation states LIMIT or approval required: "${devUnboundedBlockRes.data.data?.explanation}"`
    );

    const blockedEventId = devUnboundedBlockRes.data.data?.eventId;
    assert(Boolean(blockedEventId), `Canonical eventId created: Event #${blockedEventId}`);

    // Check sql_events record
    const [sqlEvtRows] = await pool.query(
      'SELECT id, session_id, user_id, raw_sql, status FROM sql_events WHERE id = ?',
      [blockedEventId]
    );
    assert(sqlEvtRows.length === 1, 'Event record persisted in sql_events table');
    assert(sqlEvtRows[0]?.status === 'blocked', `sql_events.status is 'blocked' (actual: ${sqlEvtRows[0]?.status})`);

    // Check policy_violations record
    const [violRows] = await pool.query(
      'SELECT rule, enforcement_type, reason FROM policy_violations WHERE event_id = ?',
      [blockedEventId]
    );
    assert(violRows.length >= 1, 'Violation record persisted in policy_violations table');
    assert(
      violRows[0]?.enforcement_type === 'blocked_pre_execution',
      `enforcement_type is 'blocked_pre_execution' (actual: ${violRows[0]?.enforcement_type})`
    );
    assert(
      violRows[0]?.rule === 'UNBOUNDED_BULK_READ',
      `Violation rule is 'UNBOUNDED_BULK_READ'`
    );

    // Check audit_log record
    const [auditRows] = await pool.query(
      `SELECT event_type, details FROM audit_log 
       WHERE user_id = ? AND event_type = 'SQL_BLOCKED_BY_POLICY' 
       ORDER BY id DESC LIMIT 1`,
      [devUserId]
    );
    assert(auditRows.length === 1, 'Audit log recorded for SQL_BLOCKED_BY_POLICY');
    const auditDetails = typeof auditRows[0].details === 'string'
      ? JSON.parse(auditRows[0].details)
      : auditRows[0].details;
    assert(
      auditDetails.enforcementOutcome === 'BLOCKED PRE-EXECUTION',
      `audit_log.enforcementOutcome is 'BLOCKED PRE-EXECUTION'`
    );

    // 4. Test: Authorized bounded query SELECT customer_code, name FROM Customers LIMIT 5; -> MUST BE ALLOWED
    console.log('\nStep 4: Testing authorized bounded query: SELECT customer_code, name FROM Customers LIMIT 5;...');
    const boundedRes = await axios.post(
      `${BASE_URL}/workspace/execute`,
      {
        session_id: devSessionId,
        sql: 'SELECT customer_code, name FROM Customers LIMIT 5;'
      },
      { headers: { Authorization: `Bearer ${devToken}` } }
    );
    assert(boundedRes.status === 200, 'Bounded query returned HTTP 200 OK');
    assert(boundedRes.data.success === true, 'Response success is true');
    assert(boundedRes.data.data?.blocked === false, 'Response blocked is false');
    assert(boundedRes.data.data?.outcome === 'ALLOWED', `Response outcome is 'ALLOWED'`);
    assert(boundedRes.data.data?.rows?.length > 0, `Rows returned: ${boundedRes.data.data?.rows?.length}`);
    assert(boundedRes.data.data?.columns?.includes('customer_code'), 'Columns contain customer_code');

    // 5. Test: Unauthorized table SELECT * FROM Payroll; -> MUST BE BLOCKED PRE-EXECUTION
    console.log('\nStep 5: Testing out-of-scope table query: SELECT * FROM Payroll;...');
    let payrollRes;
    try {
      payrollRes = await axios.post(
        `${BASE_URL}/workspace/execute`,
        {
          session_id: devSessionId,
          sql: 'SELECT * FROM Payroll;'
        },
        { headers: { Authorization: `Bearer ${devToken}` } }
      );
    } catch (err) {
      payrollRes = err.response;
    }
    assert(payrollRes.status === 403, 'Unauthorized table query returned HTTP 403');
    assert(payrollRes.data.data?.blocked === true, 'Response blocked is true');
    assert(payrollRes.data.data?.rule === 'TABLE_OUT_OF_SCOPE', `Triggered rule is 'TABLE_OUT_OF_SCOPE'`);
    assert(payrollRes.data.data?.rows?.length === 0, 'Zero rows returned for out-of-scope query');

    // 6. Test: Prohibited operation DELETE FROM Customers WHERE id = 99999; -> MUST BE BLOCKED PRE-EXECUTION
    console.log('\nStep 6: Testing unauthorized DELETE operation...');
    let deleteRes;
    try {
      deleteRes = await axios.post(
        `${BASE_URL}/workspace/execute`,
        {
          session_id: devSessionId,
          sql: 'DELETE FROM Customers WHERE id = 99999;'
        },
        { headers: { Authorization: `Bearer ${devToken}` } }
      );
    } catch (err) {
      deleteRes = err.response;
    }
    assert(deleteRes.status === 403, 'Unauthorized DELETE query returned HTTP 403');
    assert(deleteRes.data.data?.blocked === true, 'Response blocked is true');
    assert(deleteRes.data.data?.rule === 'OPERATION_NOT_GRANTED', `Triggered rule is 'OPERATION_NOT_GRANTED'`);
    assert(deleteRes.data.data?.rows?.length === 0, 'Zero rows returned for DELETE');

    // 7. Test: Prohibited DDL DROP TABLE Products; -> MUST BE BLOCKED PRE-EXECUTION
    console.log('\nStep 7: Testing unauthorized DDL schema alteration statement...');
    let ddlRes;
    try {
      ddlRes = await axios.post(
        `${BASE_URL}/workspace/execute`,
        {
          session_id: devSessionId,
          sql: 'DROP TABLE Products;'
        },
        { headers: { Authorization: `Bearer ${devToken}` } }
      );
    } catch (err) {
      ddlRes = err.response;
    }
    assert(ddlRes.status === 403, 'Unauthorized DDL statement returned HTTP 403');
    assert(ddlRes.data.data?.blocked === true, 'Response blocked is true');
    assert(ddlRes.data.data?.rule === 'UNAUTHORIZED_DDL', `Triggered rule is 'UNAUTHORIZED_DDL'`);
    assert(ddlRes.data.data?.rows?.length === 0, 'Zero rows returned for DDL');

    // 8. Test: Expired / Revoked session query execution -> MUST BE BLOCKED PRE-EXECUTION
    console.log('\nStep 8: Testing query on revoked/expired session...');
    // Revoke the developer session
    await axios.post(
      `${BASE_URL}/sessions/${devSessionId}/revoke`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    let expiredRes;
    try {
      expiredRes = await axios.post(
        `${BASE_URL}/workspace/execute`,
        {
          session_id: devSessionId,
          sql: 'SELECT customer_code FROM Customers LIMIT 1;'
        },
        { headers: { Authorization: `Bearer ${devToken}` } }
      );
    } catch (err) {
      expiredRes = err.response;
    }
    assert(expiredRes.status === 403, 'Query on revoked session returned HTTP 403');
    assert(expiredRes.data.data?.blocked === true || expiredRes.data.error?.code === 'SESSION_INACTIVE', 'Query execution denied on inactive session');

    // 9. Test: Admin exempt unbounded read -> Allowed under Admin profile
    console.log('\nStep 9: Testing Admin unbounded read: SELECT * FROM Customers; (Admin Profile Exempt)...');
    const adminProvisionRes = await axios.post(
      `${BASE_URL}/sessions/admin-provision`,
      {
        profile_id: 7, // Admin Security Administration Profile
        duration_minutes: 60
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const adminSessionId = adminProvisionRes.data.data.session_id || adminProvisionRes.data.data.sessionId;
    assert(Boolean(adminSessionId), `Admin session provisioned: Session #${adminSessionId}`);

    const adminQueryRes = await axios.post(
      `${BASE_URL}/workspace/execute`,
      {
        session_id: adminSessionId,
        sql: 'SELECT * FROM Customers;'
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(adminQueryRes.status === 200, 'Admin unbounded query returned HTTP 200 OK');
    assert(adminQueryRes.data.data?.blocked === false, 'Admin unbounded read is not blocked');
    assert(adminQueryRes.data.data?.rows?.length > 0, `Admin received ${adminQueryRes.data.data?.rows?.length} rows`);

    // Clean up admin session
    await axios.post(
      `${BASE_URL}/sessions/${adminSessionId}/revoke`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    console.log('\n================================================================');
    console.log(`   VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    await pool.end();
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during verification test:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

runVerification();
