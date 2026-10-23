// scripts/demo_reset.js
import mysql from '../backend/node_modules/mysql2/promise.js';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'itds_admin',
  password: process.env.DB_PASSWORD || 'ItdsAdminPass123!',
  multipleStatements: true
};

async function resetDemoEnvironment() {
  console.log('===========================================================');
  console.log('     ITDS DEMO ENVIRONMENT RESET & PURGE UTILITY');
  console.log('===========================================================\n');

  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
  } catch (err) {
    console.warn('⚠️  Could not connect with itds_admin, attempting with root...');
    connection = await mysql.createConnection({
      ...DB_CONFIG,
      user: 'root',
      password: process.env.MYSQL_ROOT_PASSWORD || 'Narendra@2006'
    });
  }

  try {
    // 1. Gather all ephemeral JIT usernames from db_sessions
    console.log('[1/4] Dropping lingering ephemeral JIT MySQL accounts...');
    const usersToDrop = new Set();

    try {
      const [sessUsers] = await connection.query(`
        SELECT DISTINCT mysql_username FROM \`itds_app\`.\`db_sessions\`
        WHERE mysql_username LIKE 'jit_%'
      `);
      sessUsers.forEach(r => usersToDrop.add(r.mysql_username));
    } catch (e) {
      // Table might not exist or be empty
    }

    // Also attempt querying mysql.user if privileged
    try {
      const [allJit] = await connection.query(`
        SELECT user FROM mysql.user WHERE user LIKE 'jit_%'
      `);
      allJit.forEach(r => usersToDrop.add(r.user));
    } catch (e) {
      // Ignore if itds_admin lacks SELECT on mysql.user
    }

    let droppedCount = 0;
    for (const username of usersToDrop) {
      try {
        // Kill active connections
        const [procs] = await connection.query(
          `SELECT ID FROM information_schema.processlist WHERE USER = ?`,
          [username]
        );
        for (const p of procs) {
          try {
            await connection.query(`KILL ${p.ID}`);
          } catch (e) {
            // Already dead
          }
        }
        await connection.query(`DROP USER IF EXISTS '${username}'@'%'`);
        await connection.query(`DROP USER IF EXISTS '${username}'@'localhost'`);
        droppedCount++;
      } catch (dropErr) {
        console.warn(`  ⚠️  Failed to drop user ${username}:`, dropErr.message);
      }
    }
    await connection.query('FLUSH PRIVILEGES');
    console.log(`  ✓ Purged ${droppedCount} temporary MySQL user account(s).`);

    // 2. Truncate operational telemetry and session tables in itds_app
    console.log('\n[2/4] Truncating operational tables in `itds_app`...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    const tablesToTruncate = [
      'alerts',
      'session_risk_scores',
      'policy_violations',
      'sql_events',
      'db_sessions',
      'approvals',
      'access_requests',
      'audit_log',
      'refresh_tokens'
    ];

    for (const table of tablesToTruncate) {
      await connection.query(`TRUNCATE TABLE \`itds_app\`.\`${table}\`;`);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log(`  ✓ Truncated: ${tablesToTruncate.join(', ')}.`);

    // 3. Reset ingestion watermark to current timestamp
    console.log('\n[3/4] Resetting general_log ingestion watermark...');
    await connection.query(`
      INSERT INTO \`itds_app\`.\`ingest_watermark\` (id, last_event_time, last_thread_id)
      VALUES (1, CURRENT_TIMESTAMP, 0)
      ON DUPLICATE KEY UPDATE
        last_event_time = CURRENT_TIMESTAMP,
        last_thread_id = 0;
    `);
    console.log('  ✓ Ingestion watermark advanced to CURRENT_TIMESTAMP.');

    // 4. Ensure pristine baseline definitions exist
    console.log('\n[4/4] Re-syncing baseline profiles in `itds_app.user_baselines`...');
    await connection.query(`
      INSERT INTO \`itds_app\`.\`user_baselines\` (\`user_id\`, \`avg_velocity_qpm\`, \`typical_tables\`, \`typical_hours_start\`, \`typical_hours_end\`, \`sample_size_queries\`)
      SELECT id, 6.0, JSON_ARRAY('FinanceCorpDB.Products', 'FinanceCorpDB.Orders', 'FinanceCorpDB.Customers'), 9, 18, 120
      FROM \`itds_app\`.\`users\`
      WHERE \`username\` = 'developer'
      ON DUPLICATE KEY UPDATE
        \`avg_velocity_qpm\` = VALUES(\`avg_velocity_qpm\`),
        \`typical_tables\` = VALUES(\`typical_tables\`),
        \`typical_hours_start\` = VALUES(\`typical_hours_start\`),
        \`typical_hours_end\` = VALUES(\`typical_hours_end\`);
    `);

    await connection.query(`
      INSERT INTO \`itds_app\`.\`user_baselines\` (\`user_id\`, \`avg_velocity_qpm\`, \`typical_tables\`, \`typical_hours_start\`, \`typical_hours_end\`, \`sample_size_queries\`)
      SELECT id, 10.0, JSON_ARRAY('FinanceCorpDB.Employees', 'FinanceCorpDB.Customers', 'FinanceCorpDB.Transactions', 'FinanceCorpDB.Products', 'FinanceCorpDB.Orders', 'FinanceCorpDB.VendorContracts', 'FinanceCorpDB.BudgetReports'), 8, 20, 250
      FROM \`itds_app\`.\`users\`
      WHERE \`username\` IN ('admin', 'dba')
      ON DUPLICATE KEY UPDATE
        \`avg_velocity_qpm\` = VALUES(\`avg_velocity_qpm\`),
        \`typical_tables\` = VALUES(\`typical_tables\`),
        \`typical_hours_start\` = VALUES(\`typical_hours_start\`),
        \`typical_hours_end\` = VALUES(\`typical_hours_end\`);
    `);
    console.log('  ✓ User behavioral baselines synchronized.');

    console.log('\n===========================================================');
    console.log(' ✨ DEMO ENVIRONMENT RESET COMPLETE: SYSTEM IS READY!');
    console.log('===========================================================');
  } catch (err) {
    console.error('❌ Error during demo reset:', err);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

resetDemoEnvironment();
