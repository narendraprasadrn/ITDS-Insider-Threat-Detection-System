// scripts/simulate/scenario_c_privilege_probing.js
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

export async function runScenarioC() {
  const startTs = Date.now();
  console.log('\n-----------------------------------------------------------');
  console.log(' [Scenario C] Privilege Probing & Reconnaissance Attack');
  console.log('-----------------------------------------------------------');

  // 1. Authenticate admin and developer
  const admin = await login('admin');
  const user = await login('developer');

  // 2. Request read-only JIT session
  console.log('1. Submitting JIT request for read-only session...');
  const req = await requestJitSession(user.token, 1, 30, 'Reconnaissance and privilege probing simulation');
  const credentials = req.credentials;
  const sessionId = req.sessionId || req.session_id;
  console.log(`   ✓ Session #${sessionId} provisioned for user ${credentials.username}`);

  // 3. Connect to MySQL as ephemeral JIT user
  const conn = await createDirectConnection(credentials);

  // 4. Execute unauthorized DML, DDL, and cross-schema enumeration
  console.log('2. Executing unauthorized DELETE, DROP TABLE, and schema enumeration queries...');
  const queries = [
    'DELETE FROM customers WHERE customer_code = "CUST-001";', // Unauthorized DML -> blocked_by_db
    'DROP TABLE customers;',                                   // Unauthorized DDL -> blocked_by_db
    'CREATE TABLE attack_dump (id INT PRIMARY KEY);',          // Unauthorized DDL -> blocked_by_db
    'SELECT table_name, table_schema FROM information_schema.tables WHERE table_schema = "itds_app";', // Cross-schema recon
    'SELECT user, host FROM mysql.user;',                      // Probing system authentication tables
    'DELETE FROM orders WHERE id = 1;'                         // Repeated ungranted write attempt
  ];

  await executeQueries(conn, queries, 90);
  await conn.end();
  console.log('   ✓ Probing queries executed against database engine.');

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
    scenarioId: 'C',
    name: 'Privilege Probing & Reconnaissance',
    description: 'Unauthorized DELETE/DDL attempts and cross-schema metadata enumeration',
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

if (process.argv[1]?.endsWith('scenario_c_privilege_probing.js')) {
  runScenarioC().then(res => console.log('\nResult:', res)).catch(console.error);
}
