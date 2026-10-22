// backend/src/routes/user.routes.js
import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// User management CRUD is admin only
router.use(authenticate, requireRole('admin'));

router.get('/', userController.listUsers);
router.post('/', userController.createUser);
router.get('/:id', userController.getUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

export default router;
