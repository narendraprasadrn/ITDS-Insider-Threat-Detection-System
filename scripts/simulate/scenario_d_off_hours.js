// scripts/simulate/scenario_d_off_hours.js
import mysql from '../../backend/node_modules/mysql2/promise.js';
import {
  login,
  requestJitSession,
  approveAccessRequest,
  createDirectConnection,
  executeQueries,
  waitForIngestion,
  fetchRiskScore,
  fetchViolations,
  fetchAlerts,
  revokeSession
} from './helpers.js';

export async function runScenarioD() {
  const startTs = Date.now();
  console.log('\n-----------------------------------------------------------');
  console.log(' [Scenario D] Off-Hours Sensitive Payroll Access Attack');
  console.log('-----------------------------------------------------------');

  // 1. Authenticate admin and developer
  const admin = await login('admin');
  const user = await login('developer');

  // 2. Ensure user baseline has off-hours configured for the current execution window
  const currentHour = new Date().getHours();
  const dbConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'itds_admin',
    password: 'ItdsAdminPass123!',
    database: 'itds_app'
  });

  // Temporarily set typical business hours outside current hour (e.g. 2:00 to 5:00 AM)
  await dbConn.query(
    `UPDATE user_baselines SET typical_hours_start = 2, typical_hours_end = 5 WHERE user_id = ?`,
    [user.user.id]
  );
  await dbConn.end();

  // 3. Request JIT session for Executive Payroll profile (profile_id: 5, requires approval)
  console.log('1. Submitting JIT request for Executive Payroll & Compensation profile...');
  const req = await requestJitSession(
    user.token,
    5,
    30,
    'Urgent emergency payroll reconciliation run'
  );

  console.log(`   ✓ Request #${req.requestId} submitted (status: ${req.status}). Awaiting approval...`);

  // 4. Admin approves the request
  const approval = await approveAccessRequest(admin.token, req.requestId, 'Approved for emergency simulation');
  const credentials = approval.credentials;
  const sessionId = approval.sessionId;
  console.log(`   ✓ Request #${req.requestId} approved! Provisioned JIT session #${sessionId} for user ${credentials.username}`);

  // 5. Connect to MySQL as ephemeral JIT account
  const conn = await createDirectConnection(credentials);

  // 6. Execute bulk unbounded dumps on sensitive salaries and employee data during off-hours
  console.log('2. Executing rapid bulk dumps of sensitive payroll salaries and banking details...');
  const queries = [
    'SELECT employee_id, salary_amount, bonus_amount, bank_account_masked FROM Payroll;',
    'SELECT * FROM Employees;',
    'SELECT employee_id, salary_amount, bank_account_masked FROM Payroll;',
    'SELECT * FROM Employees WHERE status = "active";',
    'SELECT count(*) FROM Payroll;'
  ];

  await executeQueries(conn, queries, 80);
  await conn.end();
  console.log('   ✓ Bulk payroll queries executed against target database.');

  // 7. Wait for ingestion poller
  console.log('3. Waiting for server-side general_log ingestion & threat detection...');
  await waitForIngestion(4000);

  // 8. Gather detection metrics
  const violations = await fetchViolations(admin.token, sessionId);
  const risk = await fetchRiskScore(admin.token, sessionId);
  const alerts = await fetchAlerts(admin.token, sessionId);

  const durationMs = Date.now() - startTs;
  const finalScore = risk?.score || 0;
  const finalLevel = risk?.risk_level || 'low';
  const alertRaised = alerts.length > 0;
  const rulesFired = (risk?.breakdown || []).map(b => b.rule_id);

  console.log(`   - Ingested Violations: ${violations.length}`);
  console.log(`   - Risk Score:          ${finalScore}/100 (${finalLevel.toUpperCase()})`);
  console.log(`   - Rules Triggered:     ${rulesFired.join(', ')}`);
  console.log(`   - Security Alert:      ${alertRaised ? `YES (Alert #${alerts[0]?.id} - ${alerts[0]?.title})` : 'NO'}`);
  console.log(`   - Duration:            ${durationMs}ms`);

  // Restore baseline hours for developer
  const resetDbConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'itds_admin',
    password: 'ItdsAdminPass123!',
    database: 'itds_app'
  });
  await resetDbConn.query(
    `UPDATE user_baselines SET typical_hours_start = 9, typical_hours_end = 18 WHERE user_id = ?`,
    [user.user.id]
  );
  await resetDbConn.end();

  // Clean up session
  await revokeSession(admin.token, sessionId);

  return {
    scenarioId: 'D',
    name: 'Off-Hours Payroll Access',
    description: 'Bulk dump of sensitive salaries table executed outside authorized work hours',
    queriesCount: queries.length,
    violationsCount: violations.length,
    riskScore: finalScore,
    riskLevel: finalLevel,
    alertRaised,
    timeToDetectMs: durationMs,
    rulesFired: rulesFired.join(', '),
    status: (alertRaised && finalScore >= 70 && rulesFired.includes('off_hours_activity')) ? 'SUCCESS' : 'FAILED'
  };
}

if (process.argv[1]?.endsWith('scenario_d_off_hours.js')) {
  runScenarioD().then(res => console.log('\nResult:', res)).catch(console.error);
}
