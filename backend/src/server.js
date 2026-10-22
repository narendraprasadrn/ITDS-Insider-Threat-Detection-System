// backend/src/server.js
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pool } from './db/pool.js';
import { startExpiryWorker, stopExpiryWorker } from './workers/expiry.worker.js';

const server = app.listen(env.PORT, () => {
  logger.info({
    port: env.PORT,
    env: env.NODE_ENV,
    db: `${env.DB.USER}@${env.DB.HOST}:${env.DB.PORT}/${env.DB.NAME}`,
    opa: env.OPA.URL
  }, `ITDS Backend API server listening on http://localhost:${env.PORT}`);

  // Start background workers
  startExpiryWorker();
});

// Graceful shutdown handling
function handleShutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal, shutting down gracefully...');
  stopExpiryWorker();

  server.close(async () => {
    try {
      await pool.end();
      logger.info('Database pool closed cleanly');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during database pool closure');
      process.exit(1);
    }
  });

  // Force close after 10s
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default server;
