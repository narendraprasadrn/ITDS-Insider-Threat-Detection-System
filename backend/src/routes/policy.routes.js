// backend/src/routes/policy.routes.js
import { Router } from 'express';
import { policyController } from '../controllers/policy.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Dev testing evaluation endpoint
router.post('/evaluate', authenticate, policyController.evaluate);

// OPA engine status
router.get('/status', authenticate, policyController.getStatus);

export default router;
