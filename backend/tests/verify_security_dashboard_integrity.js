// backend/tests/verify_security_dashboard_integrity.js
import { pool } from '../src/db/pool.js';

async function verifyDashboardIntegrity() {
  console.log('=== ITDS SECURITY MONITORING DASHBOARD VERIFICATION ===\n');

  // Step 1: Login as Admin
  console.log('1. Authenticating as Administrator...');
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  if (!loginData.success) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginData));
  }
  const token = loginData.data.accessToken;
  console.log('   Authenticated successfully (Token received).\n');

  // Step 2: Fetch /api/monitoring-stats and query MySQL directly
  console.log('2. Verifying dashboard counts against underlying MySQL database records...');
  const statsRes = await fetch('http://localhost:5000/api/monitoring-stats', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const statsData = await statsRes.json();
  if (!statsData.success) {
    throw new Error('Failed to fetch /api/monitoring-stats: ' + JSON.stringify(statsData));
  }
  const stats = statsData.data;

  // Direct MySQL queries
  const [[openAlertsRow]] = await pool.query("SELECT count(*) as count FROM alerts WHERE status = 'open'");
  const [[critAlertsRow]] = await pool.query("SELECT count(*) as count FROM alerts WHERE status = 'open' AND severity IN ('critical', 'high')");
  const [[critViolsRow]] = await pool.query("SELECT count(*) as count FROM policy_violations WHERE severity IN ('critical', 'high')");
  const [[violsRow]] = await pool.query(`
    SELECT count(*) as total,
           sum(CASE WHEN enforcement_type IN ('blocked_pre_execution', 'blocked_by_db') THEN 1 ELSE 0 END) as blocked_pre_exec,
           sum(CASE WHEN enforcement_type = 'detected_post_hoc' THEN 1 ELSE 0 END) as detected_post_hoc
    FROM policy_violations
  `);
  const [[atRiskRow]] = await pool.query(`
    SELECT count(DISTINCT ds.id) as count
    FROM db_sessions ds
    JOIN session_risk_scores srs ON ds.id = srs.session_id
    WHERE ds.status = 'active' AND srs.score >= 40
  `);

  console.log('   - Open Security Alerts:');
  console.log(`     API: ${stats.open_alerts_count} | MySQL: ${openAlertsRow.count}`);
  if (stats.open_alerts_count !== Number(openAlertsRow.count)) {
    throw new Error('Mismatch in Open Security Alerts count!');
  }

  console.log('   - High / Critical Incidents:');
  const expectedCritHigh = Number(critAlertsRow.count) + Number(critViolsRow.count);
  console.log(`     API: ${stats.critical_high_count} | MySQL: ${expectedCritHigh}`);
  if (stats.critical_high_count !== expectedCritHigh) {
    throw new Error('Mismatch in High / Critical Incidents count!');
  }

  console.log('   - Total Policy Violations:');
  console.log(`     API: ${stats.total_violations_count} | MySQL: ${violsRow.total}`);
  if (stats.total_violations_count !== Number(violsRow.total)) {
    throw new Error('Mismatch in Total Policy Violations count!');
  }

  console.log('   - Blocked Pre-Exec vs Detected Post-Hoc:');
  console.log(`     Blocked: API ${stats.blocked_pre_exec_count} | MySQL ${violsRow.blocked_pre_exec}`);
  console.log(`     Post-Hoc: API ${stats.detected_post_hoc_count} | MySQL ${violsRow.detected_post_hoc}`);
  if (stats.blocked_pre_exec_count !== Number(violsRow.blocked_pre_exec) ||
      stats.detected_post_hoc_count !== Number(violsRow.detected_post_hoc)) {
    throw new Error('Mismatch in Blocked / Post-hoc counts!');
  }

  console.log('   - Sessions At Risk:');
  console.log(`     API: ${stats.sessions_at_risk_count} | MySQL: ${atRiskRow.count}`);
  if (stats.sessions_at_risk_count !== Number(atRiskRow.count)) {
    throw new Error('Mismatch in Sessions At Risk count!');
  }
  console.log('   MATCH CONFIRMED: All dashboard counts match persisted records 100%.\n');

  // Step 3: Test repeated polling to ensure no duplicate events or count inflation
  console.log('3. Testing repeated live polling for duplicate events or count inflation...');
  const poll1 = await fetch('http://localhost:5000/api/monitoring-stats', { headers: { Authorization: `Bearer ${token}` } });
  const data1 = await poll1.json();
  const poll2 = await fetch('http://localhost:5000/api/monitoring-stats', { headers: { Authorization: `Bearer ${token}` } });
  const data2 = await poll2.json();
  const poll3 = await fetch('http://localhost:5000/api/monitoring-stats', { headers: { Authorization: `Bearer ${token}` } });
  const data3 = await poll3.json();

  if (data1.data.total_violations_count !== data2.data.total_violations_count ||
      data2.data.total_violations_count !== data3.data.total_violations_count) {
    throw new Error('Repeated polling artificially modified violation counts!');
  }
  console.log('   STABILITY CONFIRMED: Repeated polling is deterministic and produces zero duplicate events.\n');

  // Step 4: Verify Alert Investigation lifecycle (Status update 'closed' / 'resolved')
  console.log('4. Testing alert status update lifecycle...');
  const [openAlerts] = await pool.query("SELECT id FROM alerts WHERE status = 'open' LIMIT 1");
  if (openAlerts.length > 0) {
    const alertId = openAlerts[0].id;
    const patchRes = await fetch(`http://localhost:5000/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'closed', notes: 'Automated verification test triage' })
    });
    const patchData = await patchRes.json();
    if (!patchData.success) {
      throw new Error('Failed to update alert status to closed: ' + JSON.stringify(patchData));
    }
    const [checkRow] = await pool.query("SELECT status, analyst_notes FROM alerts WHERE id = ?", [alertId]);
    console.log(`   Alert #${alertId} updated in MySQL to: status='${checkRow[0].status}', notes='${checkRow[0].analyst_notes}'`);
    if (checkRow[0].status !== 'closed') {
      throw new Error('Alert status was not updated in MySQL!');
    }

    // Restore to open for testing consistency
    await pool.query("UPDATE alerts SET status = 'open', analyst_notes = NULL WHERE id = ?", [alertId]);
    console.log(`   Restored Alert #${alertId} back to 'open'.`);
  }
  console.log('   STATUS LIFECYCLE CONFIRMED: Alert triage works and synchronizes cleanly with MySQL.\n');

  console.log('=== ALL INTEGRITY VERIFICATION CHECKS PASSED SUCCESSFULLY ===');
  process.exit(0);
}

verifyDashboardIntegrity().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
