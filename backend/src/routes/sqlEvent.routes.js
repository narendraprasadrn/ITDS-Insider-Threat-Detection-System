// backend/src/routes/sqlEvent.routes.js
import { Router } from 'express';
import { sqlEventController } from '../controllers/sqlEvent.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Restricted to admin, security_analyst, dba
router.get('/', authenticate, requireRole('admin', 'security_analyst', 'dba'), sqlEventController.listEvents);

export default router;
