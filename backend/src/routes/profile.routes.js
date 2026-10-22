// backend/src/routes/profile.routes.js
import { Router } from 'express';
import { profileController } from '../controllers/profile.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /profiles/available is accessible to any authenticated employee
router.get('/available', authenticate, profileController.getAvailableProfiles);

// Admin-only profile management
router.get('/', authenticate, requireRole('admin'), profileController.listProfiles);
router.get('/:id', authenticate, profileController.getProfile);
router.post('/', authenticate, requireRole('admin'), profileController.createProfile);
router.put('/:id', authenticate, requireRole('admin'), profileController.updateProfile);
router.delete('/:id', authenticate, requireRole('admin'), profileController.deleteProfile);

export default router;
