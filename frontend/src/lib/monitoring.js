// Error monitoring (Sentry) for the website and the Android app's WebView. Off unless VITE_SENTRY_DSN is set at build time.
// Privacy: stack traces, the page path (never the query or hash), and the platform. No user, no email, no cookies, no request bodies.
import { isNativeApp } from './platform';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONG_TOKEN = /\b(?:eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}|[A-Za-z0-9_-]{40,})\b/g;
const SECRET_KEY = /authorization|cookie|token|password|secret|api[-_]?key|credential|session|jwt/i;

export const redactText = (text) => String(text ?? '').replace(EMAIL, '[email]').replace(LONG_TOKEN, '[token]');
export const stripQuery = (url) => String(url ?? '').split('?')[0].split('#')[0];

/** Things that are not our bugs: the browser cancelled a request, a slow network, a browser extension. */
export const IGNORED_ERRORS = [
  /ResizeObserver loop/i,
  /^Network Error$/i,
  /Request aborted/i,
  /AbortError/i,
  /Load failed/i,
  /Failed to fetch/i,
  /cancell?ed/i,
  /chrome-extension:/i,
  /^Script error\.?$/i,
];

export function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;
  delete event.user;
  if (event.request) event.request = { url: stripQuery(event.request.url) };
  const walk = (value, depth = 0) => {
    if (depth > 6 || value == null) return value;
    if (typeof value === 'string') return redactText(value);
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : walk(v, depth + 1)]));
    return value;
  };
  if (event.message) event.message = redactText(event.message);
  for (const ex of event.exception?.values || []) if (ex.value) ex.value = redactText(ex.value);
  if (event.extra) event.extra = walk(event.extra);
  if (event.contexts) event.contexts = walk(event.contexts);
  return event;
}

/** Breadcrumbs: no typed text, and URLs lose their query (search words are private). */
export function scrubBreadcrumb(crumb) {
  if (!crumb) return null;
  if (crumb.category === 'ui.input') return null;
  const next = { ...crumb, message: crumb.message ? redactText(crumb.message) : crumb.message };
  if (crumb.data?.url) next.data = { ...crumb.data, url: stripQuery(crumb.data.url) };
  if (crumb.data?.to) next.data = { ...(next.data || crumb.data), to: stripQuery(crumb.data.to), from: stripQuery(crumb.data.from) };
  return next;
}

let sentry = null; // the loaded SDK, or null while monitoring is off
let starting = null;

/** Start monitoring. Safe to call many times; never throws; loads the SDK only when a DSN exists. */
export function initMonitoring({ dsn = import.meta.env?.VITE_SENTRY_DSN, loader = () => import('@sentry/react') } = {}) {
  if (!dsn) return Promise.resolve(false);
  if (starting) return starting;
  starting = loader().then((mod) => {
    mod.init({
      dsn,
      environment: isNativeApp() ? 'android-app' : 'web',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      ignoreErrors: IGNORED_ERRORS,
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
    mod.setTag('platform', isNativeApp() ? 'android-app' : 'web');
    sentry = mod;
    return true;
  }).catch(() => false); // monitoring must never stop the app
  return starting;
}

/** Report an error the app caught itself (the error boundary uses this). Safe when monitoring is off. */
export function captureError(error, context = {}) {
  try { sentry?.captureException(error, { extra: { componentStack: context.componentStack ? redactText(context.componentStack).slice(0, 2000) : undefined }, tags: { boundary: context.boundary || 'app' } }); } catch { /* ignore */ }
}

export const monitoringOn = () => Boolean(sentry);
export const resetMonitoringForTests = () => { sentry = null; starting = null; };
