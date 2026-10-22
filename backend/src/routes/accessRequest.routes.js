// backend/src/routes/accessRequest.routes.js
import { Router } from 'express';
import { accessRequestController } from '../controllers/accessRequest.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Submit access request (any authenticated employee)
router.post('/', authenticate, accessRequestController.createRequest);

// Admin / Security Analyst approval queue
router.get('/pending', authenticate, requireRole('admin', 'security_analyst'), accessRequestController.listPending);
router.post('/:id/approve', authenticate, requireRole('admin'), accessRequestController.approveRequest);
router.post('/:id/deny', authenticate, requireRole('admin'), accessRequestController.denyRequest);

export default router;
