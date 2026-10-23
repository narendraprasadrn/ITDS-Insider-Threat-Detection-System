// backend/src/controllers/health.controller.js
import { healthService } from '../services/health.service.js';

export const healthController = {
  async getHealth(req, res, next) {
    try {
      const health = await healthService.getSystemHealth();
      const statusCode = health.status === 'unavailable' ? 503 : 200;
      
      res.status(statusCode).json({
        success: health.status === 'healthy',
        data: health
      });
    } catch (err) {
      next(err);
    }
  }
};
