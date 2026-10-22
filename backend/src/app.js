// backend/src/app.js
import express from 'express';
import cors from 'cors';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';

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

// Full API routes prefix (/api/health, /api/auth, /api/users, /api/resources, /api/profiles, etc.)
app.use('/api', apiRoutes);

// 404 handler
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

export default app;
