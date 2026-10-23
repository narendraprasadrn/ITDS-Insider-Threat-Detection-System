// backend/src/controllers/workspace.controller.js
import { workspaceService } from '../services/workspace.service.js';

export const workspaceController = {
  async executeQuery(req, res, next) {
    try {
      const { session_id, sql } = req.body;
      const result = await workspaceService.executeQuery({
        user: req.user,
        sessionId: session_id,
        sql,
        req
      });

      const statusCode = result.blocked ? 403 : 200;
      res.status(statusCode).json({
        success: !result.blocked,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  async getSessionHistory(req, res, next) {
    try {
      const history = await workspaceService.getSessionHistory(req.params.sessionId, req.user);
      res.status(200).json({
        success: true,
        data: { history }
      });
    } catch (err) {
      next(err);
    }
  }
};
