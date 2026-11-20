/**
 * Verifies a Google sign-in ID token (a JWT signed by Google) with no extra library:
 * signature (RS256, Google's public keys), issuer, audience (OUR client ids only), expiry, and a verified email.
 * Fail-closed: no configured client id means nothing is accepted. Tests: test/google-signin.test.js.
 */
import crypto from 'node:crypto';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const KEY_TTL_MS = 60 * 60 * 1000;
const REFETCH_MIN_MS = 60 * 1000; // an unknown key id may trigger a refetch, but never more than once a minute
const MAX_TOKEN_CHARS = 4096;

let cache = { keys: null, at: 0 };
let defaultFetcher = null;
/** Tests only: replace the call to Google's key server. */
export const setGoogleKeyFetcher = (fn) => { defaultFetcher = fn || null; resetGoogleKeyCache(); };
export const resetGoogleKeyCache = () => { cache = { keys: null, at: 0 }; };

export async function fetchGoogleKeys() {
  const res = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Google keys answered ${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.keys) ? body.keys : [];
}

const b64urlJson = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

async function findKey(kid, fetchKeys, now) {
  const fresh = cache.keys && now() - cache.at < KEY_TTL_MS;
  if (fresh) { const hit = cache.keys.find((k) => k.kid === kid); if (hit) return hit; }
  if (cache.keys && now() - cache.at < REFETCH_MIN_MS) return null; // asked a moment ago: do not hammer Google
  cache = { keys: await fetchKeys(), at: now() };
  return cache.keys.find((k) => k.kid === kid) || null;
}

/** @returns {Promise<{ok:true, claims:{sub:string,email:string,name:string,picture:string|null}} | {ok:false, reason:string}>} */
export async function verifyGoogleIdToken(idToken, { clientIds = [], fetchKeys: fk, now = Date.now, leewaySec = 60 } = {}) {
  const fetchKeys = fk || defaultFetcher || fetchGoogleKeys;
  try {
    if (!clientIds.length) return { ok: false, reason: 'not_configured' };
    if (typeof idToken !== 'string' || idToken.length > MAX_TOKEN_CHARS) return { ok: false, reason: 'malformed' };
    const parts = idToken.split('.');
    if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return { ok: false, reason: 'malformed' };

    const header = b64urlJson(parts[0]);
    if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'bad_header' }; // never accept "none" or a symmetric algorithm

    const jwk = await findKey(header.kid, fetchKeys, now);
    if (!jwk) return { ok: false, reason: 'unknown_key' };
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const valid = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'));
    if (!valid) return { ok: false, reason: 'bad_signature' };

    const c = b64urlJson(parts[1]);
    const nowSec = Math.floor(now() / 1000);
    if (!ISSUERS.has(c.iss)) return { ok: false, reason: 'bad_issuer' };
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.some((a) => clientIds.includes(a))) return { ok: false, reason: 'bad_audience' };
    if (!Number.isFinite(c.exp) || c.exp + leewaySec < nowSec) return { ok: false, reason: 'expired' };
    if (Number.isFinite(c.iat) && c.iat - leewaySec > nowSec) return { ok: false, reason: 'from_the_future' };
    if (typeof c.sub !== 'string' || !c.sub) return { ok: false, reason: 'no_subject' };
    if (typeof c.email !== 'string' || !c.email.includes('@')) return { ok: false, reason: 'no_email' };
    if (c.email_verified !== true && c.email_verified !== 'true') return { ok: false, reason: 'email_not_verified' };

    return { ok: true, claims: { sub: c.sub, email: c.email.trim().toLowerCase(), name: String(c.name || '').trim(), picture: typeof c.picture === 'string' ? c.picture : null } };
  } catch (err) {
    return { ok: false, reason: err?.message?.includes('Google keys') ? 'keys_unavailable' : 'malformed' };
  }
}
