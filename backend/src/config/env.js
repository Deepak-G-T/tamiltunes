import dotenv from 'dotenv';
dotenv.config();

const DEV_JWT_SECRET = 'tamiltunes_dev_super_secret_jwt_key_2026';

/**
 * Builds the runtime config from an env object (injectable for tests).
 * In production, missing/unsafe settings throw so the server never boots misconfigured.
 */
export const buildConfig = (env = process.env) => {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  if (isProd) {
    const problems = [];
    if (!env.DATABASE_URL) problems.push('DATABASE_URL is required');
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET === DEV_JWT_SECRET) {
      problems.push('JWT_SECRET is required (at least 32 characters, not the dev default)');
    }
    if ((env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).includes('*')) {
      problems.push('CORS_ORIGIN must be an explicit origin list in production, not "*"');
    }
    if (problems.length) {
      throw new Error(`Invalid production configuration:\n - ${problems.join('\n - ')}`);
    }
  }

  const corsList = (env.CORS_ORIGIN || (isProd ? '' : '*'))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const trustProxyRaw = env.TRUST_PROXY;
  const trustProxy =
    trustProxyRaw !== undefined && trustProxyRaw !== '' && Number.isInteger(Number(trustProxyRaw))
      ? Number(trustProxyRaw)
      : isProd ? 1 : false;

  return {
    port: env.PORT || 5000,
    nodeEnv,
    isProd,
    jwtSecret: env.JWT_SECRET || DEV_JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
    databaseUrl: env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tamiltunes',
    jiosaavnApiUrl: env.JIOSAAVN_API_URL || 'https://www.jiosaavn.com/api.php',
    musicProvider: (env.MUSIC_PROVIDER || 'jiosaavn').toLowerCase(),
    corsOrigins: corsList,
    vercelTeamSlug: env.VERCEL_TEAM_SLUG || '',
    trustProxy,
    enableExternalStreams: env.ENABLE_EXTERNAL_STREAMS === 'true'
  };
};

/**
 * Returns an origin predicate for the cors package.
 * Dev: '*' reflects any origin. Prod: only listed origins, plus Vercel preview URLs of our team
 * (https://<project>-<hash>-<team-slug>.vercel.app) when VERCEL_TEAM_SLUG is set.
 */
export const makeOriginCheck = (cfg) => {
  const allowAll = cfg.corsOrigins.includes('*');
  const slug = cfg.vercelTeamSlug.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const previewRe = slug ? new RegExp(`^https://[a-z0-9-]+-${slug}\\.vercel\\.app$`) : null;
  return (origin, cb) => {
    if (!origin) return cb(null, true); // non-browser clients (curl, health checks)
    if (allowAll || cfg.corsOrigins.includes(origin) || (previewRe && previewRe.test(origin))) {
      return cb(null, true);
    }
    return cb(null, false);
  };
};

export const config = buildConfig();
