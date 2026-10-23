// backend/src/routes/resource.routes.js
import { Router } from 'express';
import { resourceController } from '../controllers/resource.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// List resources (all authenticated roles can inspect database catalog resources)
router.get('/', authenticate, resourceController.listResources);
router.get('/:id', authenticate, resourceController.getResource);

// Resource management is admin only
router.post('/', authenticate, requireRole('admin'), resourceController.createResource);
router.put('/:id', authenticate, requireRole('admin'), resourceController.updateResource);
router.delete('/:id', authenticate, requireRole('admin'), resourceController.deleteResource);

export default router;
