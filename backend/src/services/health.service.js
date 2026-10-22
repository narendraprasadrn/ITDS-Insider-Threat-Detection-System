// backend/src/services/health.service.js
import { checkDbHealth } from '../db/pool.js';
import { opaService } from './opa.service.js';

export const healthService = {
  async getSystemHealth() {
    const startTime = Date.now();
    
    // Concurrent check of db and OPA
    const [dbHealth, opaHealth] = await Promise.all([
      checkDbHealth(),
      opaService.checkHealth()
    ]);

    const isHealthy = dbHealth.connected && opaHealth.reachable;

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      responseTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      dependencies: {
        database: {
          status: dbHealth.connected ? 'up' : 'down',
          details: dbHealth
        },
        opa: {
          status: opaHealth.reachable ? 'up' : 'down',
          details: opaHealth
        }
      }
    };
  }
};
