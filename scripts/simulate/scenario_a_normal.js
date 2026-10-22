// scripts/simulate/scenario_a_normal.js
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

export async function runScenarioA() {
  const startTs = Date.now();
  console.log('\n-----------------------------------------------------------');
  console.log(' [Scenario A] Normal Analyst Day (Compliant Operations)');
  console.log('-----------------------------------------------------------');

  // 1. Authenticate admin and analyst
  const admin = await login('admin');
  const user = await login('analyst');

  // 2. Request JIT session for Sales & Customer Read-Only (profile 1)
  console.log('1. Submitting JIT request for Sales & Customer profile...');
  const req = await requestJitSession(user.token, 1, 30, 'Daily sales metric reporting and order status checks');
  const credentials = req.credentials;
  const sessionId = req.sessionId || req.session_id;
  console.log(`   ✓ Session #${sessionId} provisioned for user ${credentials.username}`);

  // 3. Connect to MySQL as ephemeral JIT user
  const conn = await createDirectConnection(credentials);

  // 4. Execute compliant, bounded business queries
  console.log('2. Executing compliant business queries with WHERE and LIMIT clauses...');
  const queries = [
    'SELECT customer_code, company_name, city, country FROM customers WHERE country = "USA" LIMIT 10;',
    'SELECT order_number, order_date, total_amount, status FROM orders WHERE status = "shipped" LIMIT 15;',
    'SELECT customer_code, contact_name, phone FROM customers WHERE credit_limit >= 25000 LIMIT 5;'
  ];

  await executeQueries(conn, queries, 150);
  await conn.end();
  console.log('   ✓ Queries executed cleanly.');

  // 5. Wait for ingestion poller
  console.log('3. Waiting for server-side general_log ingestion...');
  await waitForIngestion(3500);

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
  console.log(`   - Security Alert:      ${alertRaised ? 'YES (UNEXPECTED)' : 'NO (PASSED)'}`);
  console.log(`   - Duration:            ${durationMs}ms`);

  // Clean up
  await revokeSession(admin.token, sessionId);

  return {
    scenarioId: 'A',
    name: 'Normal Analyst Day',
    description: 'Compliant SELECTs with WHERE and LIMIT filters',
    queriesCount: queries.length,
    violationsCount: violations.length,
    riskScore: finalScore,
    riskLevel: finalLevel,
    alertRaised,
    timeToDetectMs: durationMs,
    rulesFired: rulesFired.length > 0 ? rulesFired.join(', ') : 'None (Compliant)',
    status: (!alertRaised && finalScore < 25) ? 'SUCCESS' : 'FAILED'
  };
}

if (process.argv[1]?.endsWith('scenario_a_normal.js')) {
  runScenarioA().then(res => console.log('\nResult:', res)).catch(console.error);
}
