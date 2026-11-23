import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warmUpServer, startWarmUp, healthUrl, resetWarmUpForTests, WARM_EVERY_MS } from './warmUp';

describe('server warm-up', () => {
  beforeEach(() => resetWarmUpForTests());

  it('pings /health (no body, no cookies, never cached)', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true }));
    expect(await warmUpServer({ fetchFn, now: 1_000_000, base: '/api' })).toBe(true);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/health');
    expect(opts).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit' });
    expect(opts.body).toBeUndefined();
  });
  it('builds the address for the website and for the app', () => {
    expect(healthUrl('/api')).toBe('/api/health');
    expect(healthUrl('https://tamiltunes-backend.onrender.com/api/')).toBe('https://tamiltunes-backend.onrender.com/api/health');
  });
  it('at most once every 4 minutes', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true }));
    expect(await warmUpServer({ fetchFn, now: 10_000_000 })).toBe(true);
    expect(await warmUpServer({ fetchFn, now: 10_000_000 + WARM_EVERY_MS - 1 })).toBe(false);
    expect(await warmUpServer({ fetchFn, now: 10_000_000 + WARM_EVERY_MS })).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('never throws: offline, a refused connection or a missing fetch just does nothing', async () => {
    expect(await warmUpServer({ fetchFn: async () => { throw new Error('offline'); }, now: 20_000_000 })).toBe(false);
    resetWarmUpForTests();
    expect(await warmUpServer({ fetchFn: undefined, now: 30_000_000 })).toBe(false);
  });
  it('pings at start and again when the app comes back to the front, and can stop', async () => {
    const calls = [];
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async (u) => { calls.push(u); return { ok: true }; });
    try {
      const listeners = {};
      const doc = { visibilityState: 'hidden', addEventListener: (n, fn) => { listeners[n] = fn; }, removeEventListener: (n) => { delete listeners[n]; } };
      const stop = startWarmUp(doc);
      await Promise.resolve();
      expect(calls).toHaveLength(1); // at start
      listeners.visibilitychange(); // hidden: nothing
      expect(calls).toHaveLength(1);
      doc.visibilityState = 'visible';
      listeners.visibilitychange(); // visible again, but less than 4 minutes since the last ping: skipped
      expect(calls).toHaveLength(1);
      stop();
      expect(listeners.visibilitychange).toBeUndefined();
    } finally { globalThis.fetch = real; }
  });
});
