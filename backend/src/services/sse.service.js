// backend/src/services/sse.service.js
import { logger } from '../config/logger.js';
import { ingestorService } from './ingestor.service.js';
import { violationService } from './violation.service.js';
import { riskEngineService } from './riskEngine.service.js';

class SseService {
  constructor() {
    this.clients = new Set();
    this.heartbeatInterval = null;

    // Start heartbeat
    this.startHeartbeat();

    // Hook internal event buses
    this.initListeners();
  }

  startHeartbeat() {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 15000);
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const client of this.clients) {
      try {
        client.end();
      } catch (e) {}
    }
    this.clients.clear();
  }

  sendHeartbeat() {
    for (const client of this.clients) {
      try {
        client.write(': heartbeat\n\n');
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  initListeners() {
    // 1. Observed SQL telemetry
    ingestorService.onEvent((event) => {
      this.broadcast('query_observed', event);
    });

    // 2. Policy Violations
    violationService.onViolation((violation) => {
      this.broadcast('violation_detected', violation);
    });

    // 3. Risk Score Updates
    riskEngineService.onScoreUpdate((scoreData) => {
      this.broadcast('risk_updated', scoreData);
    });

    // 4. Security Alerts
    riskEngineService.onAlert((alert) => {
      this.broadcast('alert_created', alert);
    });
  }

  /**
   * Register a new SSE connection
   */
  addClient(res, user) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Initial greeting
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        message: 'Connected to ITDS live telemetry stream',
        user: user?.username,
        timestamp: new Date().toISOString()
      })}\n\n`
    );

    this.clients.add(res);
    logger.info({ user: user?.username, totalClients: this.clients.size }, 'SSE client connected');

    res.on('close', () => {
      this.clients.delete(res);
      logger.info({ user: user?.username, totalClients: this.clients.size }, 'SSE client disconnected');
    });
  }

  /**
   * Broadcast structured event to all active SSE subscribers
   * @param {string} eventType - 'query_observed' | 'violation_detected' | 'risk_updated' | 'alert_created'
   * @param {object} payload
   */
  broadcast(eventType, payload) {
    if (this.clients.size === 0) return;

    const dataString = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const client of this.clients) {
      try {
        client.write(dataString);
      } catch (err) {
        logger.error({ err }, 'Error writing to SSE client, removing');
        this.clients.delete(client);
      }
    }
  }

  getClientCount() {
    return this.clients.size;
  }
}

export const sseService = new SseService();
