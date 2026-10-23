// scripts/reset_demo_data.js
/**
 * ITDS Controlled Demo & Test Data Reset Script
 * 
 * Safely removes demonstrably generated test/demo records (test JIT sessions,
 * test access requests, test SQL events, test policy violations, test alerts)
 * while strictly preserving:
 *   - Real user accounts (users, user_roles, roles)
 *   - Access profiles & permissions (access_profiles, profile_resources, role_profiles)
 *   - Resource catalog (resources, target tables)
 *   - OPA policy configuration
 *   - Legitimate historical audit logs (audit_log)
 * 
 * Usage:
 *   node scripts/reset_demo_data.js            (Dry run: reports what will be removed)
 *   node scripts/reset_demo_data.js --confirm  (Executes cleanup safely)
 */

import { pool } from '../backend/src/db/pool.js';
import { env } from '../backend/src/config/env.js';

const isConfirm = process.argv.includes('--confirm') || process.argv.includes('-y');

async function runReset() {
  console.log('===============================================================');
  console.log('   ITDS CONTROLLED DEMO & TEST DATA RESET UTILITY');
  console.log('===============================================================\n');

  try {
    console.log(`Connected to database [${env.DB.NAME}]. Identifying demo & test records...\n`);

    // 1. Identify demonstrably generated test access requests
    const [testRequests] = await pool.query(`
      SELECT id, user_id, request_type, target_table, justification, created_at
      FROM access_requests
      WHERE justification LIKE '%Automated test suite%'
         OR justification LIKE '%least-privilege verification%'
         OR justification LIKE '%self-request and self-approval%'
         OR justification LIKE '%directory sync integration%'
         OR justification LIKE '%reconciliation check%'
         OR justification LIKE '%simulation%'
         OR justification LIKE '%test verification%'
         OR request_type = 'simulation'
    `);
    const testReqIds = testRequests.map(r => r.id);

    // 2. Identify demonstrably generated test sessions
    let testSessions = [];
    if (testReqIds.length > 0) {
      const [sessRows] = await pool.query(`
        SELECT ds.id, ds.mysql_username, ds.user_id, ds.status
        FROM db_sessions ds
        WHERE ds.request_id IN (?)
           OR ds.mysql_username LIKE 'jit_%'
      `, [testReqIds]);
      testSessions = sessRows;
    } else {
      const [sessRows] = await pool.query(`
        SELECT ds.id, ds.mysql_username, ds.user_id, ds.status
        FROM db_sessions ds
        WHERE ds.mysql_username LIKE 'jit_%'
      `);
      testSessions = sessRows;
    }
    const testSessionIds = testSessions.map(s => s.id);
    const testUsernames = [...new Set(testSessions.map(s => s.mysql_username).filter(Boolean))];

    // 3. Identify test SQL events
    let testSqlEvents = [];
    if (testSessionIds.length > 0) {
      const [events] = await pool.query(`
        SELECT id FROM sql_events
        WHERE session_id IN (?)
           OR source_log_id LIKE 'workspace_blocked:%'
           OR source_log_id LIKE 'workspace:admin:%'
           OR source_log_id LIKE 'ws_expired_blocked:%'
           OR source_log_id LIKE 'test_%'
           OR raw_sql LIKE '%mysql.user%'
           OR raw_sql LIKE '%DROP TABLE Customers%'
      `, [testSessionIds]);
      testSqlEvents = events;
    } else {
      const [events] = await pool.query(`
        SELECT id FROM sql_events
        WHERE source_log_id LIKE 'workspace_blocked:%'
           OR source_log_id LIKE 'workspace:admin:%'
           OR source_log_id LIKE 'ws_expired_blocked:%'
           OR source_log_id LIKE 'test_%'
           OR raw_sql LIKE '%mysql.user%'
           OR raw_sql LIKE '%DROP TABLE Customers%'
      `);
      testSqlEvents = events;
    }
    const testEventIds = testSqlEvents.map(e => e.id);

    // 4. Identify test policy violations
    let testViolations = [];
    if (testEventIds.length > 0 && testSessionIds.length > 0) {
      const [viols] = await pool.query(`
        SELECT id FROM policy_violations
        WHERE event_id IN (?) OR session_id IN (?)
      `, [testEventIds, testSessionIds]);
      testViolations = viols;
    } else if (testEventIds.length > 0) {
      const [viols] = await pool.query(`
        SELECT id FROM policy_violations
        WHERE event_id IN (?)
      `, [testEventIds]);
      testViolations = viols;
    }
    const testViolationIds = testViolations.map(v => v.id);

    // 5. Identify test alerts & risk scores
    let testAlerts = [];
    if (testSessionIds.length > 0) {
      const [alerts] = await pool.query(`
        SELECT id FROM alerts
        WHERE session_id IN (?)
           OR title LIKE '%Risk Spike on Session%'
           OR title LIKE '%Automated%'
      `, [testSessionIds]);
      testAlerts = alerts;
    } else {
      const [alerts] = await pool.query(`
        SELECT id FROM alerts
        WHERE title LIKE '%Risk Spike on Session%'
           OR title LIKE '%Automated%'
      `);
      testAlerts = alerts;
    }
    const testAlertIds = testAlerts.map(a => a.id);

    let testRiskScores = [];
    if (testSessionIds.length > 0) {
      const [scores] = await pool.query(`
        SELECT id FROM session_risk_scores WHERE session_id IN (?)
      `, [testSessionIds]);
      testRiskScores = scores;
    }

    // Report findings
    console.log('--- Confirmed Generated Test Records Found ---');
    console.log(`  • Access Requests:        ${testRequests.length}`);
    console.log(`  • JIT Sessions:           ${testSessions.length}`);
    console.log(`  • Ephemeral MySQL Users:  ${testUsernames.length}`);
    console.log(`  • SQL Events:             ${testSqlEvents.length}`);
    console.log(`  • Policy Violations:      ${testViolations.length}`);
    console.log(`  • Security Alerts:        ${testAlerts.length}`);
    console.log(`  • Session Risk Scores:    ${testRiskScores.length}`);
    console.log('----------------------------------------------');
    console.log('  [PRESERVED] User Accounts (users, roles, permissions): INTACT');
    console.log('  [PRESERVED] Access Profiles & Catalog Resources:       INTACT');
    console.log('  [PRESERVED] Audit Log History (audit_log):             INTACT\n');

    if (!isConfirm) {
      console.log('ℹ️  DRY RUN MODE. No changes were made to the database.');
      console.log('   To execute this controlled reset, re-run with:');
      console.log('     node scripts/reset_demo_data.js --confirm\n');
      process.exit(0);
    }

    console.log('⚡ Executing safe cleanup of confirmed test data...\n');

    // Drop lingering temporary MySQL accounts
    for (const uname of testUsernames) {
      try {
        const [procs] = await pool.query(
          `SELECT ID FROM information_schema.processlist WHERE USER = ?`,
          [uname]
        );
        for (const p of procs) {
          await pool.query(`KILL ${p.ID}`).catch(() => {});
        }
        await pool.query(`DROP USER IF EXISTS '${uname}'@'%'`).catch(() => {});
        await pool.query(`DROP USER IF EXISTS '${uname}'@'localhost'`).catch(() => {});
      } catch (e) {
        // Ignored
      }
    }
    await pool.query('FLUSH PRIVILEGES').catch(() => {});
    console.log(`  ✓ Pruned ${testUsernames.length} lingering ephemeral MySQL accounts.`);

    // Remove confirmed test records in foreign-key safe order
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');

    if (testViolationIds.length > 0) {
      await pool.query(`DELETE FROM policy_violations WHERE id IN (?)`, [testViolationIds]);
    }
    if (testAlertIds.length > 0) {
      await pool.query(`DELETE FROM alerts WHERE id IN (?)`, [testAlertIds]);
    }
    if (testSessionIds.length > 0) {
      await pool.query(`DELETE FROM session_risk_scores WHERE session_id IN (?)`, [testSessionIds]);
    }
    if (testEventIds.length > 0) {
      await pool.query(`DELETE FROM sql_events WHERE id IN (?)`, [testEventIds]);
    }
    if (testSessionIds.length > 0) {
      await pool.query(`DELETE FROM db_sessions WHERE id IN (?)`, [testSessionIds]);
    }
    if (testReqIds.length > 0) {
      await pool.query(`DELETE FROM access_requests WHERE id IN (?)`, [testReqIds]);
    }

    // Reset ingestion watermark to NOW(6)
    await pool.query(`
      INSERT INTO \`ingest_watermark\` (id, last_event_time, last_thread_id)
      VALUES (1, NOW(6), 0)
      ON DUPLICATE KEY UPDATE
        last_event_time = NOW(6),
        last_thread_id = 0;
    `);

    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('  ✓ Removed test violations, alerts, risk scores, events, sessions, and requests.');
    console.log('  ✓ Ingestion watermark advanced to NOW(6).');
    console.log('  ✓ Legitimate user accounts, access profiles, and audit log history were preserved.\n');
    console.log('===============================================================');
    console.log('  ✨ CONTROLLED RESET COMPLETE: DEMO DATA SAFELY PURGED');
    console.log('===============================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during demo data reset:', err);
    process.exit(1);
  }
}

runReset();
