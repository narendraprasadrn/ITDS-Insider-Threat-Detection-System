// scripts/simulate/scenario_b_exfiltration.js
import {
  login,
  requestJitSession,
  createDirectConnection,
  executeQueries,
  waitForIngestion,
  fetchRiskScore,
  fetchViolations,
  fetchAlerts,
  revokeSession
} from './helpers.js';

export async function runScenarioB() {
  const startTs = Date.now();
  console.log('\n-----------------------------------------------------------');
  console.log(' [Scenario B] Data Exfiltration (Mass Bulk Data Dump)');
  console.log('-----------------------------------------------------------');

  // 1. Authenticate admin and developer
  const admin = await login('admin');
  const user = await login('developer');

  // 2. Request JIT session for Sales & Customer profile
  console.log('1. Submitting JIT request for developer...');
  const req = await requestJitSession(user.token, 1, 30, 'Sales data exfiltration attack simulation');
  const credentials = req.credentials;
  const sessionId = req.sessionId || req.session_id;
  console.log(`   ✓ Session #${sessionId} provisioned for user ${credentials.username}`);

  // 3. Connect to MySQL as ephemeral JIT user
  const conn = await createDirectConnection(credentials);

  // 4. Execute rapid, unbounded bulk export queries & out-of-profile table access
  console.log('2. Executing rapid unbounded dumps (SELECT * without LIMIT/WHERE)...');
  const queries = [
    'SELECT * FROM Customers;',
    'SELECT * FROM Orders;',
    'SELECT * FROM Customers;',
    'SELECT * FROM Orders;',
    'SELECT * FROM Employees;', // Out of profile / ungranted -> triggers denial & out-of-profile detection
    'SELECT * FROM Customers;',
    'SELECT * FROM Orders;'
  ];

  await executeQueries(conn, queries, 80); // rapid query velocity
  await conn.end();
  console.log('   ✓ Bulk queries executed against database.');

  // 5. Wait for ingestion poller
  console.log('3. Waiting for server-side general_log ingestion & threat detection...');
  await waitForIngestion(4000);

  // 6. Gather detection metrics
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

  // Clean up
  await revokeSession(admin.token, sessionId);

  return {
    scenarioId: 'B',
    name: 'Data Exfiltration Attack',
    description: 'Mass SELECT * dumps without LIMIT/WHERE and velocity spike',
    queriesCount: queries.length,
    violationsCount: violations.length,
    riskScore: finalScore,
    riskLevel: finalLevel,
    alertRaised,
    timeToDetectMs: durationMs,
    rulesFired: rulesFired.join(', '),
    status: (alertRaised && finalScore >= 70) ? 'SUCCESS' : 'FAILED'
  };
}

if (process.argv[1]?.endsWith('scenario_b_exfiltration.js')) {
  runScenarioB().then(res => console.log('\nResult:', res)).catch(console.error);
}
