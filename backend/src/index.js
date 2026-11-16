import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import app from './app.js';
import { config } from './config/env.js';
import { initDb } from './prisma/client.js';

const startServer = async () => {
  try {
    // Initialize database (PostgreSQL via Prisma or fallback dev store)
    await initDb();

    app.listen(config.port, () => {
      console.log(`🎵 TamilTunes Backend Server running on http://localhost:${config.port}`);
      console.log(`🔒 Mode: ${config.nodeEnv}`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
};

startServer();
