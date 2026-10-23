// backend/src/routes/risk.routes.js
import { Router } from 'express';
import { riskController } from '../controllers/risk.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
const requireSecurityRole = [authenticate, requireRole('admin', 'dba')];

router.get('/risk-scores', ...requireSecurityRole, riskController.listRiskScores);
router.get('/risk-scores/:sessionId', ...requireSecurityRole, riskController.getSessionRisk);
router.get('/alerts', ...requireSecurityRole, riskController.listAlerts);
router.patch('/alerts/:id', ...requireSecurityRole, riskController.updateAlertStatus);
router.get('/monitoring-stats', ...requireSecurityRole, riskController.getMonitoringStats);

export default router;
