// backend/src/workers/ingestor.worker.js
import { ingestorService } from '../services/ingestor.service.js';
import { logger } from '../config/logger.js';

let intervalId = null;

export function startIngestorWorker(intervalMs = 1500) {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    try {
      const count = await ingestorService.poll();
      if (count > 0) {
        logger.info({ count }, 'Ingested new SQL events from mysql.general_log');
      }
    } catch (err) {
      logger.error({ err }, 'Error in SQL log ingestor worker cycle');
    }
  }, intervalMs);

  logger.info({ intervalMs }, 'SQL activity log ingestor worker started');
}

export function stopIngestorWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('SQL activity log ingestor worker stopped');
  }
}
