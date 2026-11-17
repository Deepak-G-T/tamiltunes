import assert from 'node:assert/strict';
import { buildConfig, makeOriginCheck } from '../src/config/env.js';

const goodProd = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@host/db',
  JWT_SECRET: 'x'.repeat(40),
  CORS_ORIGIN: 'https://tamiltunes.vercel.app'
};

// --- production fail-fast ---
assert.throws(() => buildConfig({ ...goodProd, JWT_SECRET: undefined }), /JWT_SECRET/);
assert.throws(() => buildConfig({ ...goodProd, JWT_SECRET: 'short' }), /JWT_SECRET/);
assert.throws(() => buildConfig({ ...goodProd, JWT_SECRET: 'tamiltunes_dev_super_secret_jwt_key_2026' }), /JWT_SECRET/);
assert.throws(() => buildConfig({ ...goodProd, DATABASE_URL: undefined }), /DATABASE_URL/);
assert.throws(() => buildConfig({ ...goodProd, CORS_ORIGIN: '*' }), /CORS_ORIGIN/);
assert.throws(() => buildConfig({ ...goodProd, CORS_ORIGIN: 'https://a.com, *' }), /CORS_ORIGIN/);
const prod = buildConfig(goodProd);
assert.equal(prod.isProd, true);
assert.equal(prod.trustProxy, 1);
assert.equal(prod.enableExternalStreams, false);
console.log('✓ production config fails fast on unsafe settings');

// --- development stays permissive ---
const dev = buildConfig({});
assert.equal(dev.isProd, false);
assert.equal(dev.trustProxy, false);
assert.deepEqual(dev.corsOrigins, ['*']);
assert.equal(buildConfig({ TRUST_PROXY: '2' }).trustProxy, 2);
console.log('✓ development defaults');

// --- CORS origin check ---
const run = (cfg, origin) => {
  let out;
  makeOriginCheck(cfg)(origin, (_e, allowed) => { out = allowed; });
  return out;
};
assert.equal(run(prod, 'https://tamiltunes.vercel.app'), true);
assert.equal(run(prod, 'https://evil.com'), false);
assert.equal(run(prod, undefined), true); // non-browser clients
assert.equal(run(prod, 'https://tamiltunes-abc123-myteam.vercel.app'), false); // no slug configured
const withSlug = buildConfig({ ...goodProd, VERCEL_TEAM_SLUG: 'myteam' });
assert.equal(run(withSlug, 'https://tamiltunes-abc123-myteam.vercel.app'), true);
assert.equal(run(withSlug, 'https://tamiltunes-abc123-otherteam.vercel.app'), false);
assert.equal(run(withSlug, 'https://myteam.vercel.app.evil.com'), false);
assert.equal(run(withSlug, 'http://tamiltunes-abc123-myteam.vercel.app'), false); // https only
assert.equal(run(dev, 'http://localhost:5173'), true);
console.log('✓ CORS origin allowlist and Vercel preview matching');
