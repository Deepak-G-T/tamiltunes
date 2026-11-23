/**
 * Faster wake-up on Render's free plan. The server used to open its port only AFTER the database answered, so the first visitor waited for
 * "process start + database wake-up" and Render's proxy answered 502/503 in the meantime (the app then retried after 2.5 s and 5 s).
 * Now the port opens at once: the health check and CORS preflights are answered immediately, and every other request WAITS for the database
 * (never served by the in-memory fallback). If the database never comes up the process exits as before, and waiting requests get a 503.
 */
import http from 'node:http';

const PASS_THROUGH_PATHS = new Set(['/health', '/api/health']);

/** Requests that never touch the database and can be answered before it is ready. */
export const isInstant = (req) => req.method === 'OPTIONS' || PASS_THROUGH_PATHS.has(String(req.url || '').split('?')[0]);

/**
 * @param {(req, res) => void} app  the Express app
 * @param {Promise<unknown>} ready  resolves when the database is connected
 * @param {{ waitMs?: number }} [opts]  longest a request waits (default 90 s, longer than any cold start)
 */
export function createGatedServer(app, ready, { waitMs = 90000 } = {}) {
  let isReady = false;
  let failed = false;
  ready.then(() => { isReady = true; }, () => { failed = true; });
  return http.createServer((req, res) => {
    if (isReady || isInstant(req)) return app(req, res);
    const unavailable = () => {
      if (res.headersSent) return;
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Retry-After', '5');
      res.end(JSON.stringify({ success: false, message: 'The server is starting. Try again in a few seconds.' }));
    };
    if (failed) return unavailable();
    const timer = setTimeout(unavailable, waitMs);
    ready.then(() => { clearTimeout(timer); if (!res.writableEnded && !res.destroyed) app(req, res); }, () => { clearTimeout(timer); unavailable(); });
    return undefined;
  });
}
