// backend/src/controllers/policy.controller.js
import { policyService } from '../services/policy.service.js';
import { AppError } from '../middleware/errorHandler.js';

export const policyController = {
  async evaluate(req, res, next) {
    try {
      const { policy, input } = req.body;
      if (!policy || !input) {
        throw new AppError('Policy name and input object are required', 400, 'BAD_REQUEST');
      }

      let result;
      if (policy === 'access_request' || policy === 'itds/access/decision') {
        result = await policyService.evaluateAccessRequest(input);
      } else if (policy === 'sql_query' || policy === 'itds/query/result') {
        result = await policyService.evaluateSqlQuery(input.session || {}, input.query || {});
      } else {
        result = await policyService.evaluate(policy, input);
      }

      res.status(200).json({
        success: true,
        data: {
          policy,
          result
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async getStatus(req, res, next) {
    try {
      const status = await policyService.getStatus();
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (err) {
      next(err);
    }
  }
};
