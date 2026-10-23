// backend/src/routes/accessRequest.routes.js
import { Router } from 'express';
import { accessRequestController } from '../controllers/accessRequest.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Submit access request (any authenticated employee)
router.post('/', authenticate, accessRequestController.createRequest);

// List access requests (Developer sees own; Admin/DBA see all with status filter)
router.get('/', authenticate, accessRequestController.listRequests);
router.get('/my', authenticate, accessRequestController.listRequests);

// Admin / DBA pending approval queue
router.get('/pending', authenticate, requireRole('admin', 'dba'), accessRequestController.listPending);

// Get single request detail
router.get('/:id', authenticate, accessRequestController.getRequestById);

// Admin / DBA approval actions
router.post('/:id/approve', authenticate, requireRole('admin', 'dba'), accessRequestController.approveRequest);
router.post('/:id/deny', authenticate, requireRole('admin', 'dba'), accessRequestController.denyRequest);

export default router;
