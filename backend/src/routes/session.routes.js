// backend/src/routes/session.routes.js
import { Router } from 'express';
import { sessionController } from '../controllers/session.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Unified session listing (scoping: Developer sees own; Admin/DBA see all with status filter)
router.get('/', authenticate, sessionController.listAllSessions);

// Employee view their own sessions
router.get('/my', authenticate, sessionController.listMySessions);

// Admin / DBA view all active sessions
router.get('/active', authenticate, requireRole('admin', 'dba'), sessionController.listActive);

// Single session detail
router.get('/:id', authenticate, sessionController.getSessionById);

// Admin / DBA force-revoke session
router.post('/:id/revoke', authenticate, requireRole('admin', 'dba'), sessionController.revoke);

export default router;
