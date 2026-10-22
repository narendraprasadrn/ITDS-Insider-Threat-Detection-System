// backend/src/middleware/requestLogger.js
import pinoHttp from 'pino-http';
import { logger } from '../config/logger.js';

export const requestLogger = pinoHttp({
  logger,
  customLogLevel: function (req, res, err) {
    if (res.statusCode >= 500 || err) {
      return 'error';
    } else if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        query: req.query
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode
      };
    }
  }
});
