import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import app from './app.js';
import { config } from './config/env.js';
import { initDb, closeDb } from './prisma/client.js';
import { createGatedServer } from './startup.js';

const startServer = async () => {
  try {
    // Open the port at once; the database connects in parallel. /health and CORS preflights are answered immediately, every other request waits
    // for the database (src/startup.js). A database that never comes up is still fatal (initDb exits the process in production).
    const ready = initDb();
    ready.catch(() => { /* initDb reports and exits in production; waiting requests get a 503 */ });
    const server = createGatedServer(app, ready);
    server.listen(config.port, () => {
      console.log(`🎵 TamilTunes Backend Server running on http://localhost:${config.port}`);
      console.log(`🔒 Mode: ${config.nodeEnv}`);
    });
    await ready;

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
