// scripts/apply_financecorp_db.js
import fs from 'fs';
import path from 'path';
import mysql from '../backend/node_modules/mysql2/promise.js';

async function main() {
  const rootConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'Narendra@2006',
    multipleStatements: true
  });

  console.log('Connected to MySQL as root.');

  // 1. Create FinanceCorpDB and grant to itds_admin
  await rootConn.query(`
    CREATE DATABASE IF NOT EXISTS \`FinanceCorpDB\`
      DEFAULT CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci;

    GRANT ALL PRIVILEGES ON \`FinanceCorpDB\`.* TO 'itds_admin'@'%' WITH GRANT OPTION;
    GRANT ALL PRIVILEGES ON \`FinanceCorpDB\`.* TO 'itds_admin'@'localhost' WITH GRANT OPTION;
    FLUSH PRIVILEGES;
  `);
  console.log('Granted full privileges on FinanceCorpDB to itds_admin.');

  // 2. Execute schema initialization
  const schemaSql = fs.readFileSync(path.resolve('scripts/init_financecorp_db.sql'), 'utf8');
  await rootConn.query(schemaSql);
  console.log('Created 10 business tables in FinanceCorpDB.');

  // 3. Execute sample data seeding
  const seedSql = fs.readFileSync(path.resolve('scripts/seed_financecorp_db.sql'), 'utf8');
  await rootConn.query(seedSql);
  console.log('Populated synthetic business data across all 10 tables.');

  // Verify counts
  const [tables] = await rootConn.query('SHOW TABLES FROM `FinanceCorpDB`');
  console.log('Tables created in FinanceCorpDB:');
  for (const t of tables) {
    const tableName = Object.values(t)[0];
    const [c] = await rootConn.query(`SELECT COUNT(*) as count FROM \`FinanceCorpDB\`.\`${tableName}\``);
    console.log(`  - ${tableName.padEnd(20)}: ${c[0].count} records`);
  }

  await rootConn.end();
}

main().catch(err => {
  console.error('Error applying FinanceCorpDB:', err);
  process.exit(1);
});
