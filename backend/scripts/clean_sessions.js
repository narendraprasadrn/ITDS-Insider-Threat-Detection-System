// backend/scripts/clean_sessions.js
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

async function cleanAllSessionsAndTelemetry() {
  console.log('================================================================');
  console.log('   ITDS — PURGING ACCUMULATED JIT SESSIONS & TELEMETRY DATA     ');
  console.log('================================================================\n');

  // Connect using admin credentials
  const conn = await mysql.createConnection({
    host: env.DB.HOST,
    port: env.DB.PORT,
    user: env.DB.USER,
    password: env.DB.PASSWORD,
    database: env.DB.NAME,
    multipleStatements: true
  });

  try {
    // 1. Retrieve all ephemeral MySQL usernames recorded in db_sessions
    const [sessions] = await conn.query('SELECT DISTINCT mysql_username FROM db_sessions WHERE mysql_username IS NOT NULL');
    console.log(`Step 1: Dropping ${sessions.length} ephemeral JIT MySQL users from MySQL server...`);

    for (const s of sessions) {
      if (s.mysql_username && s.mysql_username.startsWith('jit_')) {
        try {
          // Kill any active connection thread for this user
          const [threads] = await conn.query(
            `SELECT ID FROM information_schema.processlist WHERE USER = ?`,
            [s.mysql_username]
          );
          for (const t of threads) {
            await conn.query(`KILL ${t.ID}`).catch(() => {});
          }

          // Drop user
          await conn.query(`DROP USER IF EXISTS '${s.mysql_username}'@'%'`);
          await conn.query(`DROP USER IF EXISTS '${s.mysql_username}'@'localhost'`);
        } catch (dropErr) {
          // Ignore individual drop error if user doesn't exist
        }
      }
    }
    await conn.query('FLUSH PRIVILEGES');
    console.log('  [OK] Ephemeral MySQL users dropped and privileges flushed.');

    // 2. Disable foreign key checks temporarily for atomic truncation
    console.log('\nStep 2: Clearing session, request, telemetry, and alert tables...');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const tablesToClean = [
      'alerts',
      'session_risk_scores',
      'policy_violations',
      'sql_events',
      'approvals',
      'db_sessions',
      'access_requests',
      'audit_log'
    ];

    for (const table of tablesToClean) {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`  [OK] Truncated table: \`${table}\``);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // 3. Update ingest watermark to current time so historical general_log is skipped
    console.log('\nStep 3: Resetting SQL log ingest watermark to current timestamp...');
    await conn.query(`
      UPDATE ingest_watermark 
      SET last_event_time = NOW(6), last_thread_id = 0, updated_at = NOW() 
      WHERE id = 1
    `);
    console.log('  [OK] Watermark reset.');

    console.log('\n================================================================');
    console.log('   CLEANUP COMPLETE: All default/stale JIT sessions, requests,  ');
    console.log('   violations, and alerts have been completely removed.         ');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Error cleaning sessions:', err);
    throw err;
  } finally {
    await conn.end();
  }
}

cleanAllSessionsAndTelemetry()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
