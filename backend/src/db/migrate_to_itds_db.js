// backend/src/db/migrate_to_itds_db.js
import mysql from 'mysql2/promise';

async function copyTable(conn, sourceDb, targetDb, tableName) {
  // Drop table if incomplete
  await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);
  await conn.query(`DROP TABLE IF EXISTS ${targetDb}.\`${tableName}\``);
  // Create table structure
  await conn.query(`CREATE TABLE ${targetDb}.\`${tableName}\` LIKE ${sourceDb}.\`${tableName}\``);

  // Get non-generated columns
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND EXTRA NOT LIKE '%GENERATED%'
     ORDER BY ORDINAL_POSITION`,
    [sourceDb, tableName]
  );
  const colNames = cols.map(c => `\`${c.COLUMN_NAME}\``).join(', ');

  // Copy data
  await conn.query(`INSERT INTO ${targetDb}.\`${tableName}\` (${colNames}) SELECT ${colNames} FROM ${sourceDb}.\`${tableName}\``);
  await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);
}

async function migrate() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'itds_admin',
    password: 'ItdsAdminPass123!'
  });

  console.log('--- Step 1: Copying tables from itds_app to itds_db ---');
  const [appTables] = await conn.query('SHOW TABLES FROM itds_app');
  for (const t of appTables) {
    const tableName = Object.values(t)[0];
    console.log(`Migrating table itds_app.${tableName}...`);
    await copyTable(conn, 'itds_app', 'itds_db', tableName);
  }

  console.log('--- Step 2: Copying business tables from FinanceCorpDB to itds_db ---');
  const [fcTables] = await conn.query('SHOW TABLES FROM FinanceCorpDB');
  for (const t of fcTables) {
    const tableName = Object.values(t)[0];
    console.log(`Migrating table FinanceCorpDB.${tableName}...`);
    await copyTable(conn, 'FinanceCorpDB', 'itds_db', tableName);
  }

  console.log('--- Step 3: Updating database references in itds_db.resources ---');
  await conn.query("UPDATE itds_db.resources SET db_name = 'itds_db' WHERE db_name = 'FinanceCorpDB'");

  console.log('--- Step 4: Updating granted_resources in itds_db.db_sessions ---');
  await conn.query("UPDATE itds_db.db_sessions SET granted_resources = REPLACE(granted_resources, 'FinanceCorpDB.', 'itds_db.')");

  console.log('--- Step 5: Verification of row counts in itds_db ---');
  const [itdsTables] = await conn.query('SHOW TABLES FROM itds_db');
  console.log(`Total tables in itds_db: ${itdsTables.length}`);
  for (const t of itdsTables) {
    const name = Object.values(t)[0];
    const [c] = await conn.query(`SELECT COUNT(*) as cnt FROM itds_db.\`${name}\``);
    console.log(`itds_db.${name}: ${c[0].cnt} rows`);
  }

  await conn.end();
  console.log('Migration to itds_db completed successfully!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
