// backend/src/controllers/risk.controller.js
import { riskEngineService } from '../services/riskEngine.service.js';

export const riskController = {
  async listRiskScores(req, res, next) {
    try {
      const { session_id, user_id, risk_level, limit, offset } = req.query;
      const scores = await riskEngineService.listRiskScores({
        sessionId: session_id,
        userId: user_id,
        riskLevel: risk_level,
        limit,
        offset
      });

      res.status(200).json({
        success: true,
        data: { risk_scores: scores }
      });
    } catch (err) {
      next(err);
    }
  },

  async getSessionRisk(req, res, next) {
    try {
      const { sessionId } = req.params;
      const scores = await riskEngineService.listRiskScores({ sessionId });
      if (scores.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `No risk score found for session ID ${sessionId}`
          }
        });
      }

      res.status(200).json({
        success: true,
        data: { risk_score: scores[0] }
      });
    } catch (err) {
      next(err);
    }
  },

  async listAlerts(req, res, next) {
    try {
      const { session_id, user_id, status, severity, limit, offset } = req.query;
      const alerts = await riskEngineService.listAlerts({
        sessionId: session_id,
        userId: user_id,
        status,
        severity,
        limit,
        offset
      });

      res.status(200).json({
        success: true,
        data: { alerts }
      });
    } catch (err) {
      next(err);
    }
  },

  async updateAlertStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!['open', 'investigating', 'closed', 'resolved'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: 'Status must be one of: open, investigating, closed, resolved'
          }
        });
      }

      const updated = await riskEngineService.updateAlertStatus(id, status, notes);
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'ALERT_NOT_FOUND',
            message: `Alert ID ${id} not found`
          }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          id: parseInt(id, 10),
          status,
          notes
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async getMonitoringStats(req, res, next) {
    try {
      const stats = await riskEngineService.getMonitoringStats();
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (err) {
      next(err);
    }
  }
};
