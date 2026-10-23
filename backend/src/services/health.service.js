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

    const pipelineActive = Boolean(dbHealth.connected && dbHealth.generalLogActive);
    const isHealthy = dbHealth.connected && opaHealth.reachable && pipelineActive;

    let overallStatus = 'healthy';
    if (!dbHealth.connected && !opaHealth.reachable) {
      overallStatus = 'unavailable';
    } else if (!dbHealth.connected) {
      overallStatus = 'unavailable';
    } else if (!opaHealth.reachable || !pipelineActive) {
      overallStatus = 'degraded';
    }

    const responseTimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(process.uptime());

    return {
      status: overallStatus,
      uptime: uptimeSeconds,
      responseTimeMs,
      timestamp: new Date().toISOString(),
      dependencies: {
        backend: {
          status: 'up',
          details: {
            uptime: uptimeSeconds,
            nodeVersion: process.version,
            memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            pid: process.pid
          }
        },
        database: {
          status: dbHealth.connected ? 'up' : 'down',
          details: dbHealth
        },
        opa: {
          status: opaHealth.reachable ? 'up' : 'down',
          details: opaHealth
        },
        pipeline: {
          status: pipelineActive ? 'up' : (dbHealth.connected ? 'degraded' : 'down'),
          details: {
            generalLogActive: Boolean(dbHealth.generalLogActive),
            logOutput: dbHealth.logOutput || 'NONE',
            generalLogRows: dbHealth.generalLogRows ?? 0,
            ingestorWorker: 'running'
          }
        }
      }
    };
  }
};
