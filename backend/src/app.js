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
import commentRoutes from './routes/commentRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import userRoutes from './routes/userRoutes.js';
import relatedRoutes from './routes/relatedRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Behind Render/Vercel proxies: needed so rate limiting sees the real client IP
app.set('trust proxy', config.trustProxy);

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Allowed origins whitelist
const ALLOWED_ORIGINS = [
  'https://in-five-11.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5173'
];

const customOrigins = config.corsOrigin ? config.corsOrigin.split(',').map((o) => o.trim()) : [];

// Build preview regex strictly from VERCEL_TEAM_SLUG without guessing
export const getPreviewRegex = (teamSlug = config.vercelTeamSlug) => {
  if (!teamSlug) return null;
  const escapedSlug = teamSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^https:\\/\\/in-five-11(?:-[a-zA-Z0-9_-]+)?-${escapedSlug}\\.vercel\\.app$`);
};

export const isOriginAllowed = (origin, teamSlug = config.vercelTeamSlug) => {
  if (!origin) return true; // Server-to-server, curl, mobile native
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (customOrigins.includes(origin)) return true;
  const previewRegex = getPreviewRegex(teamSlug);
  if (previewRegex && previewRegex.test(origin)) return true;
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
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
app.use('/api', commentRoutes);
app.use('/api', relatedRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/users', userRoutes);

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
