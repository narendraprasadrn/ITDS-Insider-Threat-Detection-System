// backend/src/controllers/session.controller.js
import { sessionService } from '../services/session.service.js';

export const sessionController = {
  async listAllSessions(req, res, next) {
    try {
      const { status, limit, offset } = req.query;
      const sessions = await sessionService.listSessions({
        user: req.user,
        status,
        limit,
        offset
      });

      const active_sessions = sessions.filter(s => s.status === 'active');

      res.status(200).json({
        success: true,
        data: {
          sessions,
          active_sessions
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async listActive(req, res, next) {
    try {
      const sessions = await sessionService.getActiveSessions();
      res.status(200).json({
        success: true,
        data: {
          sessions,
          active_sessions: sessions
        }
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
        data: {
          sessions,
          active_sessions: sessions.filter(s => s.status === 'active')
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async getSessionById(req, res, next) {
    try {
      const session = await sessionService.getSessionById(req.params.id, req.user);
      res.status(200).json({
        success: true,
        data: { session }
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
  },

  async provisionAdminSession(req, res, next) {
    try {
      const { profile_id, duration_minutes } = req.body || {};
      const result = await sessionService.provisionAdminSession({
        adminUser: req.user,
        profileId: profile_id,
        durationMinutes: duration_minutes
      });
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
};
