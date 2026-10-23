// backend/src/middleware/errorHandler.js
import { logger } from '../config/logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function notFoundHandler(req, res, next) {
  const err = new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(err);
}

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  const message = err.message || 'An unexpected error occurred';
  const details = err.details || null;

  if (statusCode >= 500) {
    logger.error({
      err: {
        message: err.message,
        stack: err.stack,
        code: err.code
      },
      req: {
        method: req.method,
        url: req.originalUrl,
        params: req.params,
        query: req.query
      }
    }, 'Unhandled application error');
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      details,
      existingSession: err.existingSession || details?.existingSession,
      requestedProfile: err.requestedProfile || details?.requestedProfile,
      timestamp: new Date().toISOString()
    }
  });
}
