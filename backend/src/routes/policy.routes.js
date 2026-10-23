// backend/src/routes/policy.routes.js
import { Router } from 'express';
import { policyController } from '../controllers/policy.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Administrative sandbox policy evaluation (Restricted to Admin only)
router.post('/evaluate', authenticate, requireRole('admin'), policyController.evaluate);

// OPA engine status (Restricted to Admin only)
router.get('/status', authenticate, requireRole('admin'), policyController.getStatus);

export default router;
