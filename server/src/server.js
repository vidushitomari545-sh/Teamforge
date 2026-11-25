import app from './app.js';
import { config } from './config/env.js';
import { sessionPool } from './config/session.js';
import { prisma } from './config/prisma.js';

const server = app.listen(config.port, () => {
  console.log(`[TeamForge Server] Running on http://localhost:${config.port} in ${config.nodeEnv} mode`);
});

// Graceful shutdown
// Guard flag prevents duplicate shutdown execution when both SIGTERM and SIGINT fire.
let isShuttingDown = false;

const handleShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[TeamForge Server] ${signal} signal received. Closing HTTP server gracefully...`);
  server.close(async () => {
    console.log('[TeamForge Server] HTTP server closed.');

    if (sessionPool && typeof sessionPool.end === 'function') {
      try {
        await sessionPool.end();
        console.log('[TeamForge Server] Session database pool drained.');
      } catch (err) {
        console.error('[TeamForge Server] Error draining session pool:', err);
      }
    }

    try {
      await prisma.$disconnect();
      console.log('[TeamForge Server] Prisma client disconnected.');
    } catch (err) {
      console.error('[TeamForge Server] Error disconnecting Prisma client:', err);
    }

    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
