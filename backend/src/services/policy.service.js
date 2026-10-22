// backend/src/services/policy.service.js
import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const OPA_TIMEOUT_MS = 2500;

const opaClient = axios.create({
  baseURL: env.OPA.URL,
  timeout: OPA_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' }
});

export const policyService = {
  /**
   * Evaluate JIT Access Request using OPA
   * @param {object} input Document containing user, profile, resources, operations, duration, time_of_day, sensitivity
   * @returns {Promise<object>} { action: 'allow'|'require_approval'|'deny', allow: bool, require_approval: bool, deny: bool, reasons: string[] }
   */
  async evaluateAccessRequest(input) {
    try {
      const response = await opaClient.post('/v1/data/itds/access/decision', { input });
      if (response.data && response.data.result) {
        return response.data.result;
      }
      throw new Error('OPA returned empty decision result');
    } catch (err) {
      logger.error({ err: err.message, input }, 'OPA access request evaluation failed - FAILING CLOSED');
      // Fail closed default: deny access
      return {
        action: 'deny',
        allow: false,
        require_approval: false,
        deny: true,
        reasons: [`Policy engine evaluation failure: ${err.message}. Access denied by fail-closed security rule.`]
      };
    }
  },

  /**
   * Evaluate observed SQL query against session grant
   * @param {object} session { granted_operations, granted_resources, is_expired, mysql_username }
   * @param {object} query { operation, tables, has_where, select_star, has_limit, is_ddl }
   * @returns {Promise<object>} { allow: bool, violations: string[], reasons: string[], violation_details: object[] }
   */
  async evaluateSqlQuery(session, query) {
    try {
      const response = await opaClient.post('/v1/data/itds/query/result', {
        input: { session, query }
      });
      if (response.data && response.data.result) {
        return response.data.result;
      }
      throw new Error('OPA returned empty query evaluation result');
    } catch (err) {
      logger.error({ err: err.message, session, query }, 'OPA SQL query evaluation failed - FAILING CLOSED');
      // Fail closed default: flag violation
      return {
        allow: false,
        violations: ['POLICY_ENGINE_ERROR'],
        reasons: [`OPA evaluation unavailable: ${err.message}. Flagged by fail-closed rule.`],
        violation_details: [{
          rule: 'POLICY_ENGINE_ERROR',
          severity: 'high',
          reason: `Policy engine evaluation failed: ${err.message}`
        }]
      };
    }
  },

  /**
   * Generic dev evaluation endpoint
   */
  async evaluate(policyPath, input) {
    const cleanPath = policyPath.startsWith('/') ? policyPath.slice(1) : policyPath;
    const response = await opaClient.post(`/v1/data/${cleanPath}`, { input });
    return response.data?.result;
  },

  /**
   * Fetch OPA server health and loaded packages
   */
  async getStatus() {
    try {
      const res = await opaClient.get('/v1/data/itds');
      return {
        online: true,
        endpoint: env.OPA.URL,
        loadedPackages: Object.keys(res.data?.result || {})
      };
    } catch (err) {
      return {
        online: false,
        endpoint: env.OPA.URL,
        error: err.message
      };
    }
  }
};
