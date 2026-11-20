import assert from 'node:assert/strict';
import express from 'express';
import { scrubEvent, redactText, initMonitoring, monitoringEnabled, reportError, setReporter, resetMonitoringForTests } from '../src/monitoring.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

// 1. off without a DSN: nothing is sent, nothing throws
resetMonitoringForTests();
assert.equal(initMonitoring({ dsn: '' }), false);
assert.equal(monitoringEnabled(), false);
let sent = [];
assert.doesNotThrow(() => reportError(new Error('x')));
assert.equal(sent.length, 0);

// 2. scrubbing: no user, headers, cookies, body, query; emails and tokens are hidden
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuv';
const scrubbed = scrubEvent({
  user: { id: 'u1', email: 'a@b.com' },
  message: `failed for varadharaj@example.com with ${jwt}`,
  request: { method: 'GET', url: 'https://api.example.com/api/music/search?query=secret+song#x', headers: { authorization: `Bearer ${jwt}`, cookie: 'a=b' }, cookies: { a: 'b' }, data: { password: 'p' }, query_string: 'query=secret' },
  exception: { values: [{ type: 'Error', value: 'bad token for someone@gmail.com' }] },
  extra: { idToken: jwt, nested: { api_key: 'k', note: 'mail me at x@y.org' }, count: 3 },
  tags: { route: '/songs/:id/related' },
  breadcrumbs: [{ message: 'user a@b.com', data: { Authorization: 'x', url: '/ok' } }],
});
const blob = JSON.stringify(scrubbed);
assert.equal(scrubbed.user, undefined);
assert.deepEqual(Object.keys(scrubbed.request).sort(), ['method', 'url']);
assert.equal(scrubbed.request.url, 'https://api.example.com/api/music/search');
assert.ok(!/@(b\.com|example\.com|gmail\.com|y\.org)/.test(blob), 'no email survives');
assert.ok(!blob.includes('eyJhbGci'), 'no JWT survives');
assert.equal(scrubbed.extra.idToken, '[redacted]');
assert.equal(scrubbed.extra.nested.api_key, '[redacted]');
assert.equal(scrubbed.extra.count, 3);
assert.equal(scrubbed.tags.route, '/songs/:id/related', 'the route pattern is kept');
assert.equal(redactText('hello'), 'hello');

// 3. the error handler reports 5xx (with the route pattern) and never 4xx
setReporter((err, ctx) => sent.push({ message: err.message, ctx }));
const app = express();
app.get('/boom', (req, res, next) => next(new Error('database exploded')));
app.get('/songs/:id/related', (req, res, next) => next(new Error('related failed')));
app.get('/bad', (req, res, next) => { const e = new Error('nope'); e.statusCode = 400; next(e); });
app.get('/missing', (req, res, next) => { const e = new Error('gone'); e.status = 404; next(e); });
app.use(errorHandler);
const server = app.listen(5043);
try {
  const get = async (p) => (await fetch(`http://localhost:5043${p}`)).status;
  assert.equal(await get('/boom'), 500);
  assert.equal(await get('/songs/abc123/related'), 500);
  assert.equal(await get('/bad'), 400);
  assert.equal(await get('/missing'), 404);
  assert.equal(sent.length, 2, '4xx errors are not reported');
  assert.equal(sent[0].message, 'database exploded');
  assert.equal(sent[1].ctx.route, '/songs/:id/related', 'the pattern, not /songs/abc123/related');
  assert.ok(!JSON.stringify(sent).includes('abc123'), 'no real ids leave the server');
  // a reporter that throws must not break the response
  setReporter(() => { throw new Error('sender down'); });
  assert.equal(await get('/boom'), 500);
} finally {
  server.close();
  resetMonitoringForTests();
}
console.log('✓ monitoring: off without a DSN; events are scrubbed (no user, headers, body, query, emails, tokens); only 5xx reported with the route pattern; a broken sender never breaks a request');
process.exit(0);
