import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { db } from './prisma/client.js';
import { musicService } from './services/music/providerManager.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route imports
import authRoutes from './routes/authRoutes.js';
import musicRoutes from './routes/musicRoutes.js';
import playlistRoutes from './routes/playlistRoutes.js';
import favoriteRoutes from './routes/favoriteRoutes.js';
import historyRoutes from './routes/historyRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Apply rate limiter to /api
app.use('/api', apiLimiter);

// Health check endpoint handler with database & music cache inspection
const healthHandler = async (req, res) => {
  let dbInfo = { status: 'unknown' };
  try {
    const userCount = await db.user.count();
    const songCount = await db.song.count();
    const albumCount = (await db.album?.count()) ?? 0;
    const artistCount = (await db.artist?.count()) ?? 0;
    dbInfo = {
      status: 'connected',
      engine: 'PostgreSQL (Prisma)',
      counts: { users: userCount, songs: songCount, albums: albumCount, artists: artistCount }
    };
  } catch (e) {
    dbInfo = { status: 'degraded', error: e.message };
  }

  const musicInfo = await musicService.health();

  res.json({
    status: 'ok',
    app: 'TamilTunes API',
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    musicProvider: musicInfo.activeProvider,
    cache: musicInfo.cache,
    database: dbInfo,
    timestamp: new Date().toISOString()
  });
};

// Expose both /health and /api/health
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/history', historyRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} not found`
  });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;
