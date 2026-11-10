import app from './app.js';
import { config } from './config/env.js';

const server = app.listen(config.port, () => {
  console.log(`[TeamForge Server] Running on http://localhost:${config.port} in ${config.nodeEnv} mode`);
});

// Graceful shutdown
const handleShutdown = (signal) => {
  console.log(`\n[TeamForge Server] ${signal} signal received. Closing HTTP server gracefully...`);
  server.close(() => {
    console.log('[TeamForge Server] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
