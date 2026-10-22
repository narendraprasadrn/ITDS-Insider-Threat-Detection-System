// backend/src/controllers/violation.controller.js
import { violationService } from '../services/violation.service.js';

export const violationController = {
  async listViolations(req, res, next) {
    try {
      const { session_id, user_id, rule, severity, enforcement_type, limit, offset } = req.query;

      const violations = await violationService.listViolations({
        sessionId: session_id,
        userId: user_id,
        rule,
        severity,
        enforcementType: enforcement_type,
        limit,
        offset
      });

      res.status(200).json({
        success: true,
        data: { violations }
      });
    } catch (err) {
      next(err);
    }
  }
};
