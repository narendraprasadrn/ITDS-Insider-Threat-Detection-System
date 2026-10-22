// backend/src/routes/auth.routes.js
import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Public auth endpoints
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);

// Authenticated auth endpoints
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);
router.get('/audit', authenticate, requireRole('admin', 'security_analyst'), authController.getAuditLogs);

export default router;
