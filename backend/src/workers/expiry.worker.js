// backend/src/workers/expiry.worker.js
import cron from 'node-cron';
import { sessionService } from '../services/session.service.js';
import { logger } from '../config/logger.js';

let task = null;

export function startExpiryWorker() {
  if (task) return;

  // Run every 30 seconds
  task = cron.schedule('*/30 * * * * *', async () => {
    try {
      const expiredCount = await sessionService.processExpiredSessions();
      if (expiredCount > 0) {
        logger.info({ expiredCount }, 'JIT session expiry worker pruned expired sessions');
      }
    } catch (err) {
      logger.error({ err }, 'Error in JIT session expiry cron worker');
    }
  });

  logger.info('JIT Session expiry worker scheduled (runs every 30s)');
}

export function stopExpiryWorker() {
  if (task) {
    task.stop();
    task = null;
    logger.info('JIT Session expiry worker stopped');
  }
}
