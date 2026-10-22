// backend/src/routes/index.js
import { Router } from 'express';
import healthRoutes from './health.routes.js';

const router = Router();

// Mount health routes under /health and /api/health
router.use('/health', healthRoutes);

export default router;
