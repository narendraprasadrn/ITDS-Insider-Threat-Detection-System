// backend/src/routes/workspace.routes.js
import { Router } from 'express';
import { workspaceController } from '../controllers/workspace.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Execute query through active JIT session (all authenticated roles)
router.post('/execute', authenticate, workspaceController.executeQuery);

// Query history for a session
router.get('/history/:sessionId', authenticate, workspaceController.getSessionHistory);

export default router;
