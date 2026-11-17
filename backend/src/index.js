import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import app from './app.js';
import { config } from './config/env.js';
import { initDb, closeDb } from './prisma/client.js';

const startServer = async () => {
  try {
    // Initialize database (PostgreSQL via Prisma or fallback dev store)
    await initDb();

    const server = app.listen(config.port, () => {
      console.log(`🎵 TamilTunes Backend Server running on http://localhost:${config.port}`);
      console.log(`🔒 Mode: ${config.nodeEnv}`);
    });

    // Graceful shutdown (Render sends SIGTERM on deploy/restart): stop accepting, drain, close pool.
    let closing = false;
    const shutdown = (signal) => {
      if (closing) return;
      closing = true;
      console.log(`${signal} received: shutting down`);
      const force = setTimeout(() => process.exit(1), 10000);
      force.unref();
      server.close(async () => {
        try { await closeDb(); } finally { process.exit(0); }
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
};

startServer();
