import dotenv from 'dotenv';
dotenv.config();

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// In production, require JWT_SECRET to be explicitly set
const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (isProduction) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable must be set in production!');
  }
  return 'tamiltunes_dev_super_secret_jwt_key_2026';
};

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: getJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tamiltunes',
  jiosaavnApiUrl: process.env.JIOSAAVN_API_URL || 'https://www.jiosaavn.com/api.php',
  musicProvider: (process.env.MUSIC_PROVIDER || 'jiosaavn').toLowerCase(),
  corsOrigin: process.env.CORS_ORIGIN || '',
  enableExternalStreams: process.env.ENABLE_EXTERNAL_STREAMS === 'true'
};
