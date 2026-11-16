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

// Trimmed health check handler returning status and uptime only
const healthHandler = (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime())
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
