// backend/src/db/pool.js
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Create a connection pool for itds_app
export const pool = mysql.createPool({
  host: env.DB.HOST,
  port: env.DB.PORT,
  user: env.DB.USER,
  password: env.DB.PASSWORD,
  database: env.DB.NAME,
  waitForConnections: true,
  connectionLimit: env.DB.CONNECTION_LIMIT,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

/**
 * Execute parameterized query
 * @param {string} sql
 * @param {Array<any>} params
 * @returns {Promise<[any, any]>}
 */
export async function executeQuery(sql, params = []) {
  try {
    return await pool.execute(sql, params);
  } catch (err) {
    logger.error({ err, sql, params }, 'Database query error');
    throw err;
  }
}

/**
 * Direct query (for non-prepared or schema introspection statements)
 * @param {string} sql
 * @param {Array<any>} params
 * @returns {Promise<[any, any]>}
 */
export async function rawQuery(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    logger.error({ err, sql, params }, 'Database raw query error');
    throw err;
  }
}

/**
 * Health check on database connection and general_log table
 */
export async function checkDbHealth() {
  try {
    const [dbResult] = await pool.query('SELECT 1 AS connected, @@general_log AS general_log_active, @@log_output AS log_output');
    
    // Check general_log table read access
    const [logCountResult] = await pool.query('SELECT count(*) AS total_logs FROM mysql.general_log');
    
    return {
      connected: true,
      generalLogActive: dbResult[0]?.general_log_active === 1 || dbResult[0]?.general_log_active === '1' || dbResult[0]?.general_log_active === 'ON',
      logOutput: dbResult[0]?.log_output,
      generalLogRows: logCountResult[0]?.total_logs ?? 0
    };
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    return {
      connected: false,
      error: err.message
    };
  }
}

export default pool;
