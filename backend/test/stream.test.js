import assert from 'node:assert/strict';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { validateStreamUrl, checkStreamUrl } from '../src/services/streamGuard.js';

const bad = [
  'http://aac.saavncdn.com/a.mp4',            // not https
  'https://evil.com/a.mp4',                    // not allowlisted
  'https://saavncdn.com.evil.com/a.mp4',       // suffix trick
  'https://evilsaavncdn.com/a.mp4',            // suffix without dot boundary
  'https://127.0.0.1/a.mp4',
  'https://169.254.169.254/latest/meta-data',
  'https://[::1]/a.mp4',
  'https://localhost/a.mp4',
  'https://user:pw@aac.saavncdn.com/a.mp4',    // credentials
  'https://aac.saavncdn.com:8443/a.mp4',       // custom port
  'file:///etc/passwd',
  'not a url',
  undefined,
  ['https://aac.saavncdn.com/a.mp4']           // array from ?url=a&url=b is not a string
];
for (const u of bad) assert.equal(validateStreamUrl(u), null, `should reject ${String(u)}`);
for (const u of ['https://aac.saavncdn.com/a_320.mp4', 'https://c.saavncdn.com/x.mp4', 'https://saavncdn.com/x.mp4']) {
  assert.ok(validateStreamUrl(u), `should allow ${u}`);
}
// status codes match the pre-existing contract: 400 malformed/missing, 403 not permitted
assert.equal(checkStreamUrl(undefined).status, 400);
assert.equal(checkStreamUrl('not a url').status, 400);
assert.equal(checkStreamUrl('https://evil.com/a.mp4').status, 403);
assert.equal(checkStreamUrl('http://169.254.169.254/latest/meta-data/').status, 403);
assert.equal(checkStreamUrl('https://aac.saavncdn.com/a.mp4').status, undefined);
console.log('✓ streamGuard URL validation');

const server = app.listen(5003);
const BASE = 'http://localhost:5003/api/music/stream';
try {
  config.enableExternalStreams = false;
  let r = await fetch(`${BASE}?url=${encodeURIComponent('https://aac.saavncdn.com/a.mp4')}`);
  assert.equal(r.status, 403);
  console.log('✓ proxy disabled by default flag -> 403');

  config.enableExternalStreams = true;
  r = await fetch(`${BASE}?url=${encodeURIComponent('http://169.254.169.254/')}`);
  assert.equal(r.status, 403);
  r = await fetch(`${BASE}?url=${encodeURIComponent('https://evil.com/a.mp4')}`);
  assert.equal(r.status, 403);
  r = await fetch(`${BASE}?url=${encodeURIComponent('https://127.0.0.1/a.mp4')}`);
  assert.equal(r.status, 403);
  r = await fetch(BASE);
  assert.equal(r.status, 400);
  console.log('✓ proxy enabled still rejects disallowed targets -> 403 (missing url -> 400)');
} finally {
  config.enableExternalStreams = false;
  server.close();
}
