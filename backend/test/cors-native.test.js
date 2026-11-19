import assert from 'node:assert/strict';

// The Android app runs from https://localhost (Capacitor's Android scheme is https) and, on iOS, capacitor://localhost.
// No code change is needed on the server: they are added to the CORS_ORIGIN setting on Render. This proves that works and nothing wider opens up.
process.env.CORS_ORIGIN = 'https://frontend-eosin-five-11.vercel.app,https://localhost,capacitor://localhost';
const { isOriginAllowed } = await import('../src/app.js');

assert.ok(isOriginAllowed('https://localhost'), 'the Android app origin is allowed once it is in CORS_ORIGIN');
assert.ok(isOriginAllowed('capacitor://localhost'), 'the iOS app origin is allowed too');
assert.ok(isOriginAllowed('https://frontend-eosin-five-11.vercel.app'), 'the website still works');
assert.ok(isOriginAllowed(undefined), 'requests with no Origin header (curl, server to server) are unchanged');
for (const bad of ['http://localhost', 'https://localhost:8443', 'capacitor://localhost.evil.example', 'https://evil.example', 'https://localhost.evil.example', 'ionic://localhost', 'null']) {
  assert.equal(isOriginAllowed(bad), false, `${bad} must stay blocked`);
}
console.log('✓ CORS: the Android app origins (https://localhost, capacitor://localhost) work through CORS_ORIGIN and nothing wider opens');
process.exit(0);
