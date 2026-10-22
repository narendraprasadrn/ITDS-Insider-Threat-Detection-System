// backend/src/services/opa.service.js
import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const opaClient = axios.create({
  baseURL: env.OPA.URL,
  timeout: 3000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const opaService = {
  /**
   * Check if OPA server is reachable and responsive
   */
  async checkHealth() {
    try {
      const response = await opaClient.get('/v1/data/itds/system/health');
      return {
        reachable: true,
        data: response.data?.result || null
      };
    } catch (err) {
      logger.warn({ err: err.message }, 'OPA health check failed');
      return {
        reachable: false,
        error: err.message
      };
    }
  },

  /**
   * Evaluate a policy in OPA
   * @param {string} policyPath e.g. 'itds/access/decision'
   * @param {object} input input document for Rego
   * @returns {Promise<any>}
   */
  async evaluate(policyPath, input = {}) {
    try {
      const response = await opaClient.post(`/v1/data/${policyPath.replace(/^\//, '')}`, { input });
      return response.data?.result ?? null;
    } catch (err) {
      logger.error({ err: err.message, policyPath, input }, 'OPA policy evaluation failed - failing closed');
      // Fail-closed default: return null / deny
      throw new Error(`OPA evaluation failure for ${policyPath}: ${err.message}`);
    }
  }
};
