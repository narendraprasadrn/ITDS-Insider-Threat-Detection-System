// backend/src/db/migrate.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, '../../db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    logger.error({ dir: migrationsDir }, 'Migrations directory does not exist');
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  logger.info({ count: files.length }, 'Found migration files');

  let connection;
  try {
    connection = await mysql.createConnection({
      host: env.DB.HOST,
      port: env.DB.PORT,
      user: env.DB.USER,
      password: env.DB.PASSWORD,
      multipleStatements: true
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not connect with itds_admin, attempting with root');
    connection = await mysql.createConnection({
      host: env.DB.HOST,
      port: env.DB.PORT,
      user: 'root',
      password: process.env.MYSQL_ROOT_PASSWORD || 'Narendra@2006',
      multipleStatements: true
    });
  }

  try {
    // Ensure database exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB.NAME}\``);
    await connection.query(`USE \`${env.DB.NAME}\``);

    // Create migrations table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`_migrations\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(255) NOT NULL UNIQUE,
        \`executed_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    const [executedRows] = await connection.query('SELECT name FROM `_migrations`');
    const executedSet = new Set(executedRows.map(r => r.name));

    for (const file of files) {
      if (executedSet.has(file)) {
        logger.info({ file }, 'Migration already executed, skipping');
        continue;
      }

      logger.info({ file }, 'Executing migration');
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute SQL statements
      await connection.query(sql);

      // Record migration
      await connection.query(`INSERT INTO \`${env.DB.NAME}\`.\`_migrations\` (name) VALUES (?)`, [file]);
      logger.info({ file }, 'Migration completed successfully');
    }

    logger.info('All database migrations completed successfully.');
    await connection.end();
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    if (connection) await connection.end();
    process.exit(1);
  }
}

runMigrations();
