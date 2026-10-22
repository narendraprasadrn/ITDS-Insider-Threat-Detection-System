// backend/src/controllers/auth.controller.js
import { authService } from '../services/auth.service.js';
import { auditService } from '../services/audit.service.js';

export const authController = {
  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      const result = await authService.login(username, password, req);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshAccessToken(refreshToken);
      res.status(200).json({
        success: true,
        data: tokens
      });
    } catch (err) {
      next(err);
    }
  },

  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      await authService.logout(req.user, refreshToken, req);
      res.status(200).json({
        success: true,
        data: { message: 'Logged out successfully' }
      });
    } catch (err) {
      next(err);
    }
  },

  async getMe(req, res, next) {
    try {
      const user = await authService.getUserById(req.user.id);
      res.status(200).json({
        success: true,
        data: { user }
      });
    } catch (err) {
      next(err);
    }
  },

  async getAuditLogs(req, res, next) {
    try {
      const { limit, offset, eventType, userId } = req.query;
      const logs = await auditService.getLogs({ limit, offset, eventType, userId });
      res.status(200).json({
        success: true,
        data: { logs }
      });
    } catch (err) {
      next(err);
    }
  }
};
