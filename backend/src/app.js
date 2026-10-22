// backend/src/app.js
import express from 'express';
import cors from 'cors';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import policyRoutes from './routes/policy.routes.js';
import accessRequestRoutes from './routes/accessRequest.routes.js';
import sessionRoutes from './routes/session.routes.js';
import sqlEventRoutes from './routes/sqlEvent.routes.js';
import violationRoutes from './routes/violation.routes.js';

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Direct root endpoints as specified in phase requirements
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/profiles', profileRoutes);
app.use('/policy', policyRoutes);
app.use('/access-requests', accessRequestRoutes);
app.use('/sessions', sessionRoutes);
app.use('/sql-events', sqlEventRoutes);
app.use('/violations', violationRoutes);

// Full API routes prefix
app.use('/api', apiRoutes);

// 404 handler
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

export default app;
