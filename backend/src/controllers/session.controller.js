// backend/src/controllers/session.controller.js
import { sessionService } from '../services/session.service.js';

export const sessionController = {
  async listActive(req, res, next) {
    try {
      const sessions = await sessionService.getActiveSessions();
      res.status(200).json({
        success: true,
        data: { sessions }
      });
    } catch (err) {
      next(err);
    }
  },

  async listMySessions(req, res, next) {
    try {
      const sessions = await sessionService.getUserSessions(req.user.id);
      res.status(200).json({
        success: true,
        data: { sessions }
      });
    } catch (err) {
      next(err);
    }
  },

  async revoke(req, res, next) {
    try {
      const result = await sessionService.revokeSession(req.params.id, req.user);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
};
