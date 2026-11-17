import dotenv from 'dotenv';
dotenv.config();

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// In production, require JWT_SECRET and VERCEL_TEAM_SLUG to be explicitly set
const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (isProduction) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable must be set in production!');
  }
  return 'tamiltunes_dev_super_secret_jwt_key_2026';
};

const getVercelTeamSlug = () => {
  if (process.env.VERCEL_TEAM_SLUG && process.env.VERCEL_TEAM_SLUG.trim()) {
    return process.env.VERCEL_TEAM_SLUG.trim();
  }
  if (isProduction) {
    throw new Error('FATAL SECURITY ERROR: VERCEL_TEAM_SLUG environment variable must be set in production!');
  }
  return null;
};

// --- Optional video lookup + proxy settings (all safe/off by default) ---
export const parseTrustProxy = (env = process.env) => {
  const raw = env.TRUST_PROXY;
  if (raw !== undefined && raw !== '' && Number.isInteger(Number(raw))) return Number(raw);
  return (env.NODE_ENV || 'development') === 'production' ? 1 : false;
};

export const parseVideoConfig = (env = process.env) => ({
  youtubeApiKey: env.YOUTUBE_API_KEY || '',
  // Fail-closed: empty allow-list means every API result is rejected
  videoChannelAllowlist: (env.VIDEO_CHANNEL_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Daily quota units we allow ourselves (a lookup costs 101: search 100 + videos.list 1)
  youtubeDailyBudget:
    env.YOUTUBE_DAILY_BUDGET !== undefined && env.YOUTUBE_DAILY_BUDGET !== '' && Number.isFinite(Number(env.YOUTUBE_DAILY_BUDGET))
      ? Math.max(0, Number(env.YOUTUBE_DAILY_BUDGET))
      : 5000,
  // Pages of 50 uploads to index per allow-listed channel (about 1 quota unit per page). 0 turns the index off.
  videoIndexMaxPages:
    env.VIDEO_INDEX_MAX_PAGES !== undefined && env.VIDEO_INDEX_MAX_PAGES !== '' && Number.isFinite(Number(env.VIDEO_INDEX_MAX_PAGES))
      ? Math.min(40, Math.max(0, Math.floor(Number(env.VIDEO_INDEX_MAX_PAGES))))
      : 10,
  // After an index miss, spend ~101 quota units on a per-song search (within the daily budget). false = index only.
  videoSearchFallback: (env.VIDEO_SEARCH_FALLBACK || 'true').toLowerCase() !== 'false'
});

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: getJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tamiltunes',
  jiosaavnApiUrl: process.env.JIOSAAVN_API_URL || 'https://www.jiosaavn.com/api.php',
  musicProvider: (process.env.MUSIC_PROVIDER || 'jiosaavn').toLowerCase(),
  corsOrigin: process.env.CORS_ORIGIN || '',
  vercelTeamSlug: getVercelTeamSlug(),
  enableExternalStreams: process.env.ENABLE_EXTERNAL_STREAMS === 'true',
  trustProxy: parseTrustProxy(),
  ...parseVideoConfig()
};
