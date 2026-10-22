// scripts/verify_phase1.js
import mysql from '../backend/node_modules/mysql2/promise.js';

async function verify() {
  console.log('====================================================');
  console.log('   ITDS PHASE 1 VERIFICATION & HEALTH CHECK');
  console.log('====================================================\n');

  let passed = true;

  // 1. Check Backend /health endpoint
  try {
    const res = await fetch('http://127.0.0.1:5000/health');
    const data = await res.json();
    if (res.status === 200 && data.success && data.data.status === 'healthy') {
      console.log('✅ [1/5] Backend Health Endpoint: OK (HTTP 200)');
      console.log(`        Status: ${data.data.status}, Uptime: ${Math.round(data.data.uptime)}s, DB: ${data.data.dependencies.database.status}, OPA: ${data.data.dependencies.opa.status}`);
    } else {
      console.error('❌ [1/5] Backend Health Endpoint: Failed', data);
      passed = false;
    }
  } catch (err) {
    console.error('❌ [1/5] Backend Health Endpoint unreachable:', err.message);
    passed = false;
  }

  // 2. Check OPA REST API directly
  try {
    const opaRes = await fetch('http://127.0.0.1:8181/v1/data/itds/system/health');
    const opaData = await opaRes.json();
    if (opaRes.status === 200 && opaData.result?.status === 'ok') {
      console.log('✅ [2/5] OPA Server (port 8181): OK');
      console.log(`        System: "${opaData.result.system}", Version: ${opaData.result.version}`);
    } else {
      console.error('❌ [2/5] OPA Server check failed:', opaData);
      passed = false;
    }
  } catch (err) {
    console.error('❌ [2/5] OPA Server unreachable:', err.message);
    passed = false;
  }

  // 3. Check MySQL itds_admin connection, general_log and schemas
  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'itds_admin',
      password: 'ItdsAdminPass123!',
      database: 'itds_app'
    });

    const [generalLogRows] = await connection.query("SELECT @@general_log AS gen_log, @@log_output AS log_out;");
    const genLog = generalLogRows[0].gen_log;
    const logOut = generalLogRows[0].log_out;

    if ((genLog === 1 || genLog === 'ON') && logOut.includes('TABLE')) {
      console.log('✅ [3/5] MySQL Server Configuration: OK');
      console.log(`        general_log: ON (1), log_output: TABLE`);
    } else {
      console.warn('⚠️ [3/5] MySQL configuration not strictly TABLE/ON:', generalLogRows[0]);
    }

    // 4. Verify target_db seed count
    const [counts] = await connection.query(`
      SELECT 'departments' AS tbl, count(*) AS cnt FROM target_db.departments
      UNION ALL SELECT 'employees', count(*) FROM target_db.employees
      UNION ALL SELECT 'salaries', count(*) FROM target_db.salaries
      UNION ALL SELECT 'customers', count(*) FROM target_db.customers
      UNION ALL SELECT 'orders', count(*) FROM target_db.orders
      UNION ALL SELECT 'payments', count(*) FROM target_db.payments;
    `);

    let totalRows = 0;
    const breakdown = {};
    for (const row of counts) {
      breakdown[row.tbl] = row.cnt;
      totalRows += Number(row.cnt);
    }

    if (totalRows >= 500) {
      console.log(`✅ [4/5] target_db Seed Data: OK (${totalRows} total rows)`);
      console.log(`        Breakdown: ${JSON.stringify(breakdown)}`);
    } else {
      console.error(`❌ [4/5] target_db has fewer than 500 rows (${totalRows})`);
      passed = false;
    }

    // Check general_log table populating
    const [logCount] = await connection.query('SELECT count(*) AS count FROM mysql.general_log;');
    console.log(`        Captured mysql.general_log rows: ${logCount[0].count}`);

    await connection.end();
  } catch (err) {
    console.error('❌ [3/5 & 4/5] Database check failed:', err.message);
    passed = false;
  }

  // 5. Check Frontend Dev Server
  try {
    const frontRes = await fetch('http://localhost:5173/');
    if (frontRes.status === 200) {
      console.log('✅ [5/5] Frontend Vite Application: OK (HTTP 200)');
    } else {
      console.error('❌ [5/5] Frontend returned status:', frontRes.status);
      passed = false;
    }
  } catch (err) {
    console.error('❌ [5/5] Frontend server unreachable:', err.message);
    passed = false;
  }

  console.log('\n====================================================');
  if (passed) {
    console.log(' 🎉 ALL PHASE 1 VERIFICATION CHECKS PASSED!');
  } else {
    console.log(' ❌ SOME VERIFICATION CHECKS FAILED');
    process.exit(1);
  }
  console.log('====================================================');
}

verify();
