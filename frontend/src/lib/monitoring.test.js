import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrubEvent, scrubBreadcrumb, redactText, stripQuery, IGNORED_ERRORS, initMonitoring, captureError, monitoringOn, resetMonitoringForTests } from './monitoring';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuv';

describe('monitoring: privacy', () => {
  it('removes the user, the query string, emails and tokens from an event', () => {
    const out = scrubEvent({
      user: { id: 'u1', email: 'a@b.com' },
      request: { url: 'https://app.example/search?q=my+private+search#x', headers: { cookie: 'a=b' } },
      message: `oops for varadharaj@example.com ${JWT}`,
      exception: { values: [{ value: 'bad for someone@gmail.com' }] },
      extra: { idToken: JWT, nested: { password: 'p', note: 'x@y.org' }, n: 2 },
    });
    const blob = JSON.stringify(out);
    expect(out.user).toBeUndefined();
    expect(out.request).toEqual({ url: 'https://app.example/search' });
    expect(blob).not.toMatch(/@(b\.com|example\.com|gmail\.com|y\.org)/);
    expect(blob).not.toContain('eyJhbGci');
    expect(out.extra.idToken).toBe('[redacted]');
    expect(out.extra.n).toBe(2);
  });
  it('drops typed text and strips queries from breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'ui.input', message: 'typed' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'fetch', data: { url: '/api/music/search?query=secret' } }).data.url).toBe('/api/music/search');
    expect(scrubBreadcrumb({ category: 'navigation', data: { from: '/a?x=1', to: '/b?q=2' } }).data).toEqual({ from: '/a', to: '/b' });
  });
  it('helpers', () => {
    expect(stripQuery('/a/b?c=d#e')).toBe('/a/b');
    expect(redactText('mail me@x.com')).toBe('mail [email]');
  });
  it('ignores noise that is not our bug', () => {
    for (const m of ['ResizeObserver loop limit exceeded', 'Network Error', 'AbortError: x', 'Script error.']) expect(IGNORED_ERRORS.some((r) => r.test(m))).toBe(true);
    expect(IGNORED_ERRORS.some((r) => r.test("Cannot read properties of undefined (reading 'x')"))).toBe(false);
  });
});

describe('monitoring: start and report', () => {
  beforeEach(() => resetMonitoringForTests());
  it('does nothing without a DSN (the SDK is not even loaded)', async () => {
    const loader = vi.fn();
    expect(await initMonitoring({ dsn: '', loader })).toBe(false);
    expect(loader).not.toHaveBeenCalled();
    expect(monitoringOn()).toBe(false);
    expect(() => captureError(new Error('x'))).not.toThrow();
  });
  it('starts with safe settings and reports through the SDK', async () => {
    const mod = { init: vi.fn(), setTag: vi.fn(), captureException: vi.fn() };
    expect(await initMonitoring({ dsn: 'https://k@o.ingest.sentry.io/1', loader: async () => mod })).toBe(true);
    const opts = mod.init.mock.calls[0][0];
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.tracesSampleRate).toBe(0);
    expect(opts.environment).toBe('web');
    expect(opts.beforeSend).toBe(scrubEvent);
    captureError(new Error('boom'), { componentStack: 'at X', boundary: 'page' });
    expect(mod.captureException).toHaveBeenCalledTimes(1);
    expect(mod.captureException.mock.calls[0][1].tags.boundary).toBe('page');
  });
  it('a failing SDK load never breaks the app', async () => {
    expect(await initMonitoring({ dsn: 'https://k@o.ingest.sentry.io/1', loader: async () => { throw new Error('blocked by an ad blocker'); } })).toBe(false);
    expect(monitoringOn()).toBe(false);
  });
});
