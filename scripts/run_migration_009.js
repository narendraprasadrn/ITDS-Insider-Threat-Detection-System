// scripts/run_migration_009.js
import fs from 'fs';
import { pool } from '../backend/src/db/pool.js';

async function run() {
  const sql = fs.readFileSync('backend/db/migrations/009_request_lifecycle_and_workspace.sql', 'utf8');
  const cleanSql = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleanSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.toLowerCase().startsWith('use '));

  for (const stmt of statements) {
    console.log(`Executing: ${stmt.slice(0, 50)}...`);
    await pool.query(stmt);
    console.log('✓ Success');
  }

  const [cols] = await pool.query('DESCRIBE itds_app.access_requests');
  console.log('access_requests columns:', cols.map(c => c.Field));

  await pool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
