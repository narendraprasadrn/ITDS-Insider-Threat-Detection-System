// backend/src/routes/workspace.routes.js
import { Router } from 'express';
import { workspaceController } from '../controllers/workspace.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Execute query through active JIT session (all authenticated roles)
router.post('/execute', authenticate, workspaceController.executeQuery);

// Query history for a session or administrative console
router.get('/history', authenticate, (req, res, next) => {
  req.params.sessionId = req.query.sessionId || 'admin';
  workspaceController.getSessionHistory(req, res, next);
});
router.get('/history/:sessionId', authenticate, workspaceController.getSessionHistory);

// Policy violations for a session or administrative console
router.get('/violations', authenticate, (req, res, next) => {
  req.params.sessionId = req.query.sessionId || 'admin';
  workspaceController.getSessionViolations(req, res, next);
});
router.get('/violations/:sessionId', authenticate, workspaceController.getSessionViolations);

export default router;
