// backend/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';

/**
 * JWT Authentication Middleware
 */
export function authenticate(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return next(new AppError('Authentication token missing or invalid', 401, 'UNAUTHORIZED'));
  }

  try {
    const decoded = jwt.verify(token, env.JWT.SECRET);
    req.user = {
      id: decoded.sub,
      username: decoded.username,
      email: decoded.email,
      roles: decoded.roles || [],
      permissions: decoded.permissions || []
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Authentication token has expired', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Invalid authentication token', 401, 'INVALID_TOKEN'));
  }
}

/**
 * RBAC: Role check middleware
 * @param  {...string} roles Allowed roles
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    const hasRole = req.user.roles.some(userRole => roles.includes(userRole));
    if (!hasRole) {
      return next(
        new AppError(
          `Access denied. Requires one of roles: [${roles.join(', ')}]`,
          403,
          'FORBIDDEN_ROLE',
          { requiredRoles: roles, userRoles: req.user.roles }
        )
      );
    }
    next();
  };
}

/**
 * RBAC: Permission check middleware
 * @param  {...string} permissions Allowed permissions
 */
export function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    const hasPermission = req.user.permissions.some(userPerm => permissions.includes(userPerm));
    if (!hasPermission) {
      return next(
        new AppError(
          `Access denied. Requires one of permissions: [${permissions.join(', ')}]`,
          403,
          'FORBIDDEN_PERMISSION',
          { requiredPermissions: permissions, userPermissions: req.user.permissions }
        )
      );
    }
    next();
  };
}
