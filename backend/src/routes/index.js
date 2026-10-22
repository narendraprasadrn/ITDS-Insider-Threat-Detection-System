// backend/src/routes/index.js
import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import resourceRoutes from './resource.routes.js';
import profileRoutes from './profile.routes.js';
import policyRoutes from './policy.routes.js';
import accessRequestRoutes from './accessRequest.routes.js';
import sessionRoutes from './session.routes.js';
import sqlEventRoutes from './sqlEvent.routes.js';
import violationRoutes from './violation.routes.js';
import riskRoutes from './risk.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/resources', resourceRoutes);
router.use('/profiles', profileRoutes);
router.use('/policy', policyRoutes);
router.use('/access-requests', accessRequestRoutes);
router.use('/sessions', sessionRoutes);
router.use('/sql-events', sqlEventRoutes);
router.use('/violations', violationRoutes);
router.use('/', riskRoutes);

export default router;
