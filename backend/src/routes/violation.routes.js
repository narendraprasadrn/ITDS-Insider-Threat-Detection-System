// backend/src/routes/violation.routes.js
import { Router } from 'express';
import { violationController } from '../controllers/violation.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Restricted to admin, dba
router.get('/', authenticate, requireRole('admin', 'dba'), violationController.listViolations);

export default router;
