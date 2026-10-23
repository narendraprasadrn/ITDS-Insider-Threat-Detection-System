// backend/src/routes/sqlEvent.routes.js
import { Router } from 'express';
import { sqlEventController } from '../controllers/sqlEvent.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Restricted to admin, dba
router.get('/', authenticate, requireRole('admin', 'dba'), sqlEventController.listEvents);

export default router;
