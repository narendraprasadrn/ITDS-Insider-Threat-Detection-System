// backend/src/controllers/sqlEvent.controller.js
import { ingestorService } from '../services/ingestor.service.js';

export const sqlEventController = {
  async listEvents(req, res, next) {
    try {
      const { session_id, user_id, operation, status, limit, offset } = req.query;
      const events = await ingestorService.listEvents({
        sessionId: session_id,
        userId: user_id,
        operation,
        status,
        limit,
        offset
      });

      res.status(200).json({
        success: true,
        data: { events }
      });
    } catch (err) {
      next(err);
    }
  }
};
