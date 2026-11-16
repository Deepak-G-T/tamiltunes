import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'tamiltunes_dev_super_secret_jwt_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tamiltunes',
  jiosaavnApiUrl: process.env.JIOSAAVN_API_URL || 'https://www.jiosaavn.com/api.php',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  enableExternalStreams: process.env.ENABLE_EXTERNAL_STREAMS === 'true'
};
