import assert from 'node:assert/strict';
import { createGatedServer, isInstant } from '../src/startup.js';

const served = [];
const app = (req, res) => { served.push(`${req.method} ${req.url}`); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, url: req.url })); };
const listen = (server) => new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
const get = async (port, path, method = 'GET') => { const t = Date.now(); const r = await fetch(`http://localhost:${port}${path}`, { method }); return { status: r.status, ms: Date.now() - t, body: await r.json().catch(() => null), retry: r.headers.get('retry-after') }; };

// pure rule
assert.equal(isInstant({ method: 'GET', url: '/api/health' }), true);
assert.equal(isInstant({ method: 'GET', url: '/health?x=1' }), true);
assert.equal(isInstant({ method: 'OPTIONS', url: '/api/music/home' }), true, 'CORS preflights never need the database');
assert.equal(isInstant({ method: 'GET', url: '/api/music/home' }), false);
assert.equal(isInstant({ method: 'GET', url: '/api/health/../me' }), false);

// 1. the port is open at once; health answers immediately; other requests wait for the database
{
  let open; const ready = new Promise((r) => { open = r; });
  const server = createGatedServer(app, ready);
  const port = await listen(server);
  try {
    const health = await get(port, '/api/health');
    assert.equal(health.status, 200);
    assert.ok(health.ms < 500, `health answered at once (${health.ms} ms) while the database is still waking`);
    assert.equal((await get(port, '/api/music/home', 'OPTIONS')).status, 200, 'a preflight is answered at once');
    assert.deepEqual(served, ['GET /api/health', 'OPTIONS /api/music/home']);
    const waiting = get(port, '/api/music/home'); // must wait
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(served.length, 2, 'the request is held, not served by an app with no database');
    open(); // the database is ready
    const done = await waiting;
    assert.equal(done.status, 200);
    assert.ok(done.ms >= 250, 'it was served after the database came up');
    assert.equal(served.at(-1), 'GET /api/music/home');
    const later = await get(port, '/api/me/queue');
    assert.equal(later.status, 200);
    assert.ok(later.ms < 300, 'afterwards nothing waits');
    console.log('✓ startup: the port opens at once, /health and preflights answer immediately, other requests wait for the database and then run normally');
  } finally { server.close(); }
}

// 2. a database that never comes up: waiting requests get a 503 (the process exits in production), later ones too
{
  let fail; const ready = new Promise((_, rej) => { fail = rej; });
  const server = createGatedServer(app, ready);
  const port = await listen(server);
  try {
    const waiting = get(port, '/api/music/home');
    await new Promise((r) => setTimeout(r, 100));
    fail(new Error('db down'));
    const r1 = await waiting;
    assert.equal(r1.status, 503);
    assert.equal(r1.retry, '5');
    assert.equal(r1.body.success, false);
    const r2 = await get(port, '/api/music/home');
    assert.equal(r2.status, 503, 'a request after the failure is told straight away');
    assert.equal((await get(port, '/api/health')).status, 200, 'health still answers');
    console.log('✓ startup: if the database never comes up, requests get 503 with Retry-After (never the in-memory fallback)');
  } finally { server.close(); }
}

// 3. a request that waits too long gets a 503, and the late database does not serve a request nobody is waiting for
{
  let open; const ready = new Promise((r) => { open = r; });
  const before = served.length;
  const server = createGatedServer(app, ready, { waitMs: 200 });
  const port = await listen(server);
  try {
    const r = await get(port, '/api/music/home');
    assert.equal(r.status, 503);
    open();
    await new Promise((r2) => setTimeout(r2, 100));
    assert.equal(served.length, before, 'the timed-out request is not served afterwards');
    console.log('✓ startup: a request that waits longer than the limit gets 503 and is not served late');
  } finally { server.close(); }
}
process.exit(0);
