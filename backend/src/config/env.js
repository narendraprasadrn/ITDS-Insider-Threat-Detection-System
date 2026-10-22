// backend/src/config/env.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  
  DB: {
    HOST: process.env.DB_HOST || '127.0.0.1',
    PORT: parseInt(process.env.DB_PORT, 10) || 3306,
    USER: process.env.DB_USER || 'itds_admin',
    PASSWORD: process.env.DB_PASSWORD || 'ItdsAdminPass123!',
    NAME: process.env.DB_NAME || 'itds_app',
    TARGET_NAME: process.env.TARGET_DB_NAME || 'target_db',
    CONNECTION_LIMIT: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10
  },
  
  OPA: {
    URL: process.env.OPA_URL || 'http://127.0.0.1:8181'
  },
  
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};
