import { describe, it, expect } from 'vitest';
import { API_TIMEOUT_MS, COLD_START_RETRY_DELAYS_MS, looksLikeWaking, coldStartRetryDelay } from './coldStart';

const net = () => Object.assign(new Error('Network Error'), {});
const timeout = () => Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' });
const status = (s) => Object.assign(new Error(`HTTP ${s}`), { response: { status: s } });

describe('cold start handling', () => {
  it('waits longer than a wake-up takes (about 40 s)', () => {
    expect(API_TIMEOUT_MS).toBeGreaterThanOrEqual(60000);
  });

  it('treats timeouts, network errors and gateway errors as "still waking"', () => {
    for (const e of [net(), timeout(), status(502), status(503), status(504)]) expect(looksLikeWaking(e)).toBe(true);
  });

  it('treats real answers as real errors', () => {
    for (const s of [400, 401, 403, 404, 409, 422, 429, 500]) expect(looksLikeWaking(status(s))).toBe(false);
  });

  it('retries a GET twice with growing waits, then gives up', () => {
    const cfg = { method: 'get' };
    expect(coldStartRetryDelay(cfg, timeout())).toBe(COLD_START_RETRY_DELAYS_MS[0]);
    cfg._coldStartRetries = 1;
    expect(coldStartRetryDelay(cfg, timeout())).toBe(COLD_START_RETRY_DELAYS_MS[1]);
    cfg._coldStartRetries = 2;
    expect(coldStartRetryDelay(cfg, timeout())).toBeNull();
  });

  it('never retries a write, so nothing is saved twice', () => {
    for (const method of ['post', 'put', 'patch', 'delete', 'POST']) expect(coldStartRetryDelay({ method }, timeout())).toBeNull();
  });

  it('does not retry a real error even on a GET', () => {
    expect(coldStartRetryDelay({ method: 'get' }, status(401))).toBeNull();
    expect(coldStartRetryDelay({ method: 'get' }, status(404))).toBeNull();
  });

  it('treats a missing method as GET and ignores a missing config', () => {
    expect(coldStartRetryDelay({}, net())).toBe(COLD_START_RETRY_DELAYS_MS[0]);
    expect(coldStartRetryDelay(undefined, net())).toBeNull();
  });
});
