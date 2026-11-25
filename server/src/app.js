import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { sessionMiddleware } from './config/session.js';
import apiRoutes from './routes/index.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// When deployed in production behind a reverse proxy (e.g. Nginx, Cloudflare, AWS ALB),
// Express must trust the proxy headers (X-Forwarded-Proto) to identify HTTPS connections,
// which is required for secure cookies (secure: true) to be sent by browsers.
if (config.isProduction) {
  app.set('trust proxy', 1);
}

// Standard middleware
app.use(cors({
  origin: config.clientUrl,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware mounted after CORS and body parsers, but before API routes
app.use(sessionMiddleware);

// API routes
app.use('/api', apiRoutes);

// Catch-all 404 handler
app.use(notFoundHandler);

// Centralized error handling
app.use(errorHandler);

export default app;
