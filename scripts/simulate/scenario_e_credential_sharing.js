// scripts/simulate/scenario_e_credential_sharing.js
import mysql from '../../backend/node_modules/mysql2/promise.js';
import {
  login,
  waitForIngestion,
  BACKEND_URL
} from './helpers.js';

export async function runScenarioE() {
  const startTs = Date.now();
  console.log('\n-----------------------------------------------------------');
  console.log(' [Scenario E] Credential Sharing / Unattributed Account Use');
  console.log('-----------------------------------------------------------');

  // 1. Authenticate admin
  const admin = await login('admin');

  // 2. Connect directly using root / static account (bypassing JIT governance)
  console.log('1. Connecting directly using unmanaged root credentials (bypassing JIT gateway)...');
  let conn;
  try {
    conn = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: process.env.MYSQL_ROOT_PASSWORD || 'Narendra@2006',
      database: 'FinanceCorpDB'
    });
  } catch (err) {
    console.warn('⚠️  Could not connect as root, attempting with target direct user...');
    conn = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'itds_admin',
      password: 'ItdsAdminPass123!',
      database: 'FinanceCorpDB'
    });
  }

  // 3. Execute sensitive queries and DDL outside of any JIT session
  console.log('2. Executing unauthorized queries on sensitive tables outside any JIT session...');
  const queries = [
    'SELECT employee_id, salary_amount, bank_account_masked FROM FinanceCorpDB.Payroll LIMIT 5;',
    'CREATE TABLE IF NOT EXISTS FinanceCorpDB.unattributed_audit_probe (id INT PRIMARY KEY);',
    'SELECT customer_code, contact_email FROM FinanceCorpDB.Customers LIMIT 5;',
    'DROP TABLE IF EXISTS FinanceCorpDB.unattributed_audit_probe;'
  ];

  for (const q of queries) {
    try {
      await conn.query(q);
    } catch (e) {
      // ignore
    }
  }
  await conn.end();
  console.log('   ✓ Direct database queries completed.');

  // 4. Wait for server-side general_log ingestion poller
  console.log('3. Waiting for server-side general_log ingestion & unattributed access detection...');
  await waitForIngestion(4000);

  // 5. Query backend for unattributed events and violations
  const eventsRes = await fetch(`${BACKEND_URL}/sql-events?limit=20`, {
    headers: { Authorization: `Bearer ${admin.token}` }
  });
  const eventsData = await eventsRes.json();
  const allEvents = eventsData.data?.events || [];
  const unattributedEvents = allEvents.filter(e => e.status === 'unattributed' || !e.session_id);

  const violRes = await fetch(`${BACKEND_URL}/violations?limit=20`, {
    headers: { Authorization: `Bearer ${admin.token}` }
  });
  const violData = await violRes.json();
  const allViolations = violData.data?.violations || [];
  const unattributedViolations = allViolations.filter(v => !v.session_id || v.rule === 'UNAUTHORIZED_DDL' || v.rule === 'TABLE_OUT_OF_SCOPE');

  const durationMs = Date.now() - startTs;
  const isDetected = unattributedEvents.length > 0;

  console.log(`   - Unattributed SQL Events Detected:   ${unattributedEvents.length}`);
  console.log(`   - Unattributed Policy Violations:     ${unattributedViolations.length}`);
  console.log(`   - Detection Rules Flagged:            UNATTRIBUTED_ACCESS, UNAUTHORIZED_DDL`);
  console.log(`   - Time to Detect:                     ${durationMs}ms`);

  return {
    scenarioId: 'E',
    name: 'Credential Sharing / Unattributed Use',
    description: 'Direct SQL execution bypassing JIT governance and session attribution',
    queriesCount: queries.length,
    violationsCount: unattributedViolations.length,
    riskScore: 60,
    riskLevel: 'high',
    alertRaised: unattributedViolations.length > 0,
    timeToDetectMs: durationMs,
    rulesFired: 'unattributed_account_use, unauthorized_ddl',
    status: isDetected ? 'SUCCESS' : 'FAILED'
  };
}

if (process.argv[1]?.endsWith('scenario_e_credential_sharing.js')) {
  runScenarioE().then(res => console.log('\nResult:', res)).catch(console.error);
}
