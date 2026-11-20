// Error monitoring (Sentry). Off unless SENTRY_DSN is set, so tests, development and a missing setting never send anything.
// Privacy: we send stack traces and the route PATTERN only. No user, no email, no headers, no cookies, no request body, no query string.
import * as Sentry from '@sentry/node';

const SECRET_KEY = /authorization|cookie|token|password|secret|api[-_]?key|credential|session|jwt/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONG_TOKEN = /\b(?:eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}|[A-Za-z0-9_-]{40,})\b/g; // a JWT or a long opaque key

export const redactText = (text) => String(text ?? '').replace(EMAIL, '[email]').replace(LONG_TOKEN, '[token]');
const stripQuery = (url) => String(url ?? '').split('?')[0].split('#')[0];

/** Remove anything personal or secret from an event before it leaves the server. Exported for tests. */
export function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;
  delete event.user;
  if (event.request) {
    event.request = { method: event.request.method, url: stripQuery(event.request.url) }; // no headers, cookies, body or query
  }
  const walk = (value, depth = 0) => {
    if (depth > 6 || value == null) return value;
    if (typeof value === 'string') return redactText(value);
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
    if (typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : walk(v, depth + 1)]));
    }
    return value;
  };
  if (event.message) event.message = redactText(event.message);
  for (const ex of event.exception?.values || []) if (ex.value) ex.value = redactText(ex.value);
  if (event.extra) event.extra = walk(event.extra);
  if (event.contexts) event.contexts = walk(event.contexts);
  if (event.tags) event.tags = walk(event.tags);
  if (event.breadcrumbs) {
    event.breadcrumbs = (Array.isArray(event.breadcrumbs) ? event.breadcrumbs : event.breadcrumbs.values || []).map((b) => ({ ...b, message: b.message ? redactText(b.message) : b.message, data: b.data ? walk(b.data) : b.data }));
  }
  return event;
}

let enabled = false;
let reporter = (err, ctx) => Sentry.captureException(err, { tags: ctx });

/** Start monitoring when SENTRY_DSN is set. Returns true when it is on. */
export function initMonitoring({ dsn = process.env.SENTRY_DSN, environment = process.env.NODE_ENV || 'development', release = process.env.RENDER_GIT_COMMIT } = {}) {
  if (!dsn || enabled) return enabled;
  Sentry.init({ dsn, environment, release, sendDefaultPii: false, tracesSampleRate: 0, beforeSend: scrubEvent });
  enabled = true;
  return true;
}

export const monitoringEnabled = () => enabled;

/** Report a server error (500s only: a 4xx is the caller's mistake). Never throws. */
export function reportError(err, ctx = {}) {
  try { if (enabled) reporter(err, ctx); } catch { /* monitoring must never break a request */ }
}

/** Tests replace the sender; pass null to restore. */
export function setReporter(fn) { reporter = fn || ((err, ctx) => Sentry.captureException(err, { tags: ctx })); enabled = Boolean(fn) || enabled; }
export function resetMonitoringForTests() { enabled = false; reporter = (err, ctx) => Sentry.captureException(err, { tags: ctx }); }
