// backend/src/routes/sse.routes.js
import { Router } from 'express';
import { sseController } from '../controllers/sse.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Restricted to admin, dba
router.get('/', authenticate, requireRole('admin', 'dba'), sseController.stream);

export default router;
