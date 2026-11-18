import assert from 'node:assert/strict';
process.env.FRONTEND_URL = 'https://frontend-eosin-five-11.vercel.app,http://localhost:3000';
const { default: app } = await import('../src/app.js');
const { initDb, db } = await import('../src/prisma/client.js');
const { normalizeEmail, hashPassword, verifyPassword, BCRYPT_COST } = await import('../src/services/auth/credentials.js');
const { createEmailSender, resetLink, frontendBase } = await import('../src/services/auth/email.js');
const { getResetStore, hashToken, newToken } = await import('../src/services/auth/resetStore.js');
const { requestReset, useReset, RESET_TTL_MS } = await import('../src/services/auth/passwordReset.js');
const { setEmailSender, flushResetJobs } = await import('../src/controllers/passwordResetController.js');
const limiters = await import('../src/middleware/rateLimiter.js');

await initDb();
const outbox = createEmailSender({ env: { EMAIL_PROVIDER: 'log', NODE_ENV: 'test' }, logger: { info() {} } });
setEmailSender(outbox);
const server = app.listen(5019);
const BASE = 'http://localhost:5019/api';
const tag = Math.random().toString(36).slice(2, 7);
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};
const resetLimits = async () => { for (const l of [limiters.forgotIpLimiter, limiters.resetIpLimiter, limiters.loginIpLimiter, limiters.registerIpLimiter]) for (const ip of ['::1', '::ffff:127.0.0.1', '127.0.0.1']) await l.resetKey(`ip:${ip}`); };
const lastToken = () => decodeURIComponent(/token=([^\s&]+)/.exec(outbox.outbox.at(-1).text)[1]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ---- one shared helper: normal emails, hashes with one setting, passwords never touched
  assert.equal(normalizeEmail('  Mixed.Case@Example.COM '), 'mixed.case@example.com');
  assert.equal(normalizeEmail(undefined), '');
  const h = await hashPassword('  Pass word  ');
  assert.ok(h.startsWith(`$2b$${BCRYPT_COST}$`) && h.length === 60, 'bcrypt, cost 12, 60 characters');
  assert.equal(await verifyPassword('  Pass word  ', h), true);
  assert.equal(await verifyPassword('Pass word', h), false, 'the password is never trimmed');
  assert.equal(await verifyPassword('pass word', h), false, 'the password is never lower-cased');
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', undefined), false);
  assert.equal(await verifyPassword('x', 'not-a-hash'), false, 'a broken hash is "no", not a crash');
  console.log('✓ auth: one helper for emails and passwords (trim + lower-case email, bcrypt cost 12, password untouched)');

  // ---- the regression: sign up, then log in with the same credentials, in any letter case
  const email = `Mixed.Case.${tag}@Example.com`;
  const reg = await call('POST', '/auth/register', { body: { name: 'Test User', email: `  ${email}  `, password: 'secret-pass-1' } });
  assert.equal(reg.status, 201);
  assert.equal(reg.json.user.email, email.toLowerCase(), 'the email is saved trimmed and lower-case');
  assert.equal((await db.user.findUnique({ where: { email: email.toLowerCase() } })).email, email.toLowerCase());
  for (const variant of [email, email.toLowerCase(), email.toUpperCase(), `  ${email.toLowerCase()}  `]) {
    const ok = await call('POST', '/auth/login', { body: { email: variant, password: 'secret-pass-1' } });
    assert.equal(ok.status, 200, `login works with the email written as ${JSON.stringify(variant)}`);
    assert.ok(ok.json.token && ok.json.user.id === reg.json.user.id);
  }
  console.log('✓ auth: sign up, then log in with the same credentials, same or different letter case, with spaces around the email');

  // ---- signup knows the same account in every spelling
  for (const variant of [email.toUpperCase(), ` ${email.toLowerCase()} `]) {
    const dup = await call('POST', '/auth/register', { body: { name: 'Again', email: variant, password: 'another-pass-1' } });
    assert.equal(dup.status, 400);
    assert.equal(dup.json.code, 'EMAIL_EXISTS');
    assert.match(dup.json.message, /already exists/);
  }
  console.log('✓ auth: "already exists" for the same email in any case or spacing');

  // ---- one generic login error
  const wrongPassword = await call('POST', '/auth/login', { body: { email, password: 'wrong-password' } });
  const unknownEmail = await call('POST', '/auth/login', { body: { email: `nobody-${tag}@example.com`, password: 'wrong-password' } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.json, unknownEmail.json, 'a wrong password and an unknown email look exactly the same');
  assert.equal(wrongPassword.json.message, 'Invalid email or password');
  assert.equal((await call('POST', '/auth/login', { body: { email: 'not-an-email', password: 'x' } })).status, 400);
  console.log('✓ auth: one generic "Invalid email or password" for a wrong email and a wrong password');

  // ---- passwords: 8+ for new ones, spaces are part of the password
  assert.equal((await call('POST', '/auth/register', { body: { name: 'Short', email: `short-${tag}@example.com`, password: '1234567' } })).status, 400);
  const spaced = await call('POST', '/auth/register', { body: { name: 'Spaced', email: `spaced-${tag}@example.com`, password: '  spaced pass  ' } });
  assert.equal(spaced.status, 201);
  assert.equal((await call('POST', '/auth/login', { body: { email: `spaced-${tag}@example.com`, password: '  spaced pass  ' } })).status, 200);
  assert.equal((await call('POST', '/auth/login', { body: { email: `spaced-${tag}@example.com`, password: 'spaced pass' } })).status, 401, 'trimming the password would have been a bug');
  console.log('✓ auth: new passwords need 8 characters; spaces in a password are kept');

  // ---- forgot password: the same answer for every email, and only a real account gets an email
  await resetLimits();
  const known = await call('POST', '/auth/forgot-password', { body: { email: email.toUpperCase() } });
  const unknown = await call('POST', '/auth/forgot-password', { body: { email: `ghost-${tag}@example.com` } });
  await flushResetJobs();
  assert.equal(known.status, 200);
  assert.deepEqual(known.json, unknown.json, 'the answer never says whether the email is registered');
  assert.equal(known.json.message, 'If an account exists, we sent a link');
  assert.equal(outbox.outbox.length, 1, 'only the real account got an email');
  assert.equal(outbox.outbox[0].to, email.toLowerCase());
  assert.ok(outbox.outbox[0].text.startsWith('Hi,') && outbox.outbox[0].text.includes('https://frontend-eosin-five-11.vercel.app/reset-password?token='), 'the link uses FRONTEND_URL (the first origin)');
  assert.equal(frontendBase({ FRONTEND_URL: 'https://a.example/,http://b.example' }), 'https://a.example');
  assert.equal(resetLink('t k', { FRONTEND_URL: 'https://a.example' }), 'https://a.example/reset-password?token=t%20k');
  assert.equal((await call('POST', '/auth/forgot-password', { body: { email: 'nope' } })).status, 400);
  console.log('✓ auth: forgot password answers the same for known and unknown emails; the link uses FRONTEND_URL');

  // ---- the token: random, stored only as a hash
  const token1 = lastToken();
  const store = getResetStore();
  assert.ok(token1.length >= 43, '32 random bytes');
  assert.notEqual(newToken(), newToken());
  const row = await store.findByHash(hashToken(token1));
  assert.ok(row && row.userId === reg.json.user.id);
  assert.ok(!Object.values(row).includes(token1) && row.tokenHash !== token1, 'the token itself is not stored, only its hash');
  assert.ok(new Date(row.expiresAt).getTime() - Date.now() <= RESET_TTL_MS && new Date(row.expiresAt).getTime() - Date.now() > RESET_TTL_MS - 5000, 'it expires in 30 minutes');
  console.log('✓ auth: the reset token is 32 random bytes, stored only as a hash, valid for 30 minutes');

  // ---- a new request closes the older link
  await requestReset({ email, sender: outbox });
  const token2 = lastToken();
  assert.notEqual(token1, token2);
  const oldTry = await call('POST', '/auth/reset-password', { body: { token: token1, password: 'brand-new-pass-1' } });
  assert.equal(oldTry.status, 400);
  assert.equal(oldTry.json.code, 'RESET_INVALID');
  console.log('✓ auth: asking for a new link closes the older one');

  // ---- expiry
  await requestReset({ email, sender: outbox });
  const expiring = lastToken();
  await store.expireForTest(hashToken(expiring), new Date(Date.now() - 1000));
  assert.equal((await call('POST', '/auth/reset-password', { body: { token: expiring, password: 'brand-new-pass-1' } })).status, 400, 'an expired link does not work');
  console.log('✓ auth: an expired link is refused');

  // ---- password rules on the reset page; unknown tokens look the same as bad ones
  await requestReset({ email, sender: outbox });
  const good = lastToken();
  assert.equal((await call('POST', '/auth/reset-password', { body: { token: good, password: 'short' } })).status, 400);
  const unknownToken = await call('POST', '/auth/reset-password', { body: { token: newToken(), password: 'brand-new-pass-1' } });
  assert.deepEqual(unknownToken.json, oldTry.json, 'an unknown link and a used or expired one give the same answer');
  assert.equal((await call('POST', '/auth/reset-password', { body: { token: 'x', password: 'brand-new-pass-1' } })).status, 400);

  // ---- the reset itself: new password works, old does not, signed in, other sessions end, data stays
  const sessionBefore = (await call('POST', '/auth/login', { body: { email, password: 'secret-pass-1' } })).json.token;
  assert.equal((await call('GET', '/auth/me', { token: sessionBefore })).status, 200);
  const playlist = await db.playlist.create({ data: { name: 'My list', userId: reg.json.user.id, isPublic: false } });
  await sleep(1100); // sign-in tokens are dated to the second
  const done = await call('POST', '/auth/reset-password', { body: { token: good, password: 'brand-new-pass-1' } });
  assert.equal(done.status, 200);
  assert.ok(done.json.token && done.json.user.email === email.toLowerCase(), 'the reset signs the person in');
  assert.equal((await call('GET', '/auth/me', { token: done.json.token })).status, 200, 'the new session works');
  assert.equal((await call('GET', '/auth/me', { token: sessionBefore })).status, 401, 'other sessions are signed out');
  assert.equal((await call('POST', '/auth/login', { body: { email, password: 'secret-pass-1' } })).status, 401, 'the old password stops working');
  assert.equal((await call('POST', '/auth/login', { body: { email, password: 'brand-new-pass-1' } })).status, 200);
  assert.ok(await db.playlist.findUnique({ where: { id: playlist.id } }), 'playlists and the rest of the account are untouched');
  console.log('✓ auth: reset sets the new password, signs in, ends other sessions, keeps all data');

  // ---- single use, even at the same moment
  const reuse = await call('POST', '/auth/reset-password', { body: { token: good, password: 'yet-another-pass-1' } });
  assert.equal(reuse.status, 400, 'a used link cannot be used again');
  await requestReset({ email, sender: outbox });
  const racing = lastToken();
  const results = await Promise.all([useReset({ token: racing, newPassword: 'race-pass-one-1' }), useReset({ token: racing, newPassword: 'race-pass-two-2' })]);
  assert.equal(results.filter(Boolean).length, 1, 'two simultaneous uses: exactly one wins');
  console.log('✓ auth: a link works once, also when used twice at the same time');

  // ---- email providers (no real network)
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const brevo = createEmailSender({ env: { EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k-brevo', RESET_EMAIL_FROM: 'noreply@example.com' }, fetchImpl: fakeFetch });
  await brevo.send({ to: 'a@b.com', subject: 'S', text: 'T', html: '<p>T</p>' });
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].init.headers['api-key'], 'k-brevo');
  assert.deepEqual(JSON.parse(calls[0].init.body).to, [{ email: 'a@b.com' }]);
  const resend = createEmailSender({ env: { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k-resend', RESET_EMAIL_FROM: 'noreply@example.com' }, fetchImpl: fakeFetch });
  await resend.send({ to: 'a@b.com', subject: 'S', text: 'T', html: '<p>T</p>' });
  assert.equal(calls[1].url, 'https://api.resend.com/emails');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer k-resend');
  const failing = createEmailSender({ env: { EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'secret-key-value', RESET_EMAIL_FROM: 'n@e.com' }, fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(() => failing.send({ to: 'a@b.com', subject: 'S', text: 'T', html: 'x' }), (e) => !String(e.message).includes('secret-key-value'));
  assert.equal(createEmailSender({ env: { NODE_ENV: 'production' } }).isConfigured(), false, 'in production nothing is sent until a provider is configured');
  assert.equal(createEmailSender({ env: { EMAIL_PROVIDER: 'brevo', NODE_ENV: 'production' } }).isConfigured(), false, 'a provider without its key is not configured');
  assert.equal(createEmailSender({ env: { EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k', RESET_EMAIL_FROM: 'a@b.c' } }).isConfigured(), true);
  console.log('✓ auth: Brevo and Resend requests are shaped right, a failure never leaks the key');

  // ---- rate limits: per email and per address
  await resetLimits();
  const target = `limit-${tag}@example.com`;
  await call('POST', '/auth/register', { body: { name: 'Limit', email: target, password: 'limit-pass-1' } });
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await call('POST', '/auth/login', { body: { email: target, password: `wrong-${i}` } })).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401), 'ten wrong tries are answered normally');
  assert.deepEqual(statuses.slice(10), [429, 429], 'then this email is paused, whatever the password');
  const paused = await call('POST', '/auth/login', { body: { email: target, password: 'limit-pass-1' } });
  assert.equal(paused.status, 429);
  assert.equal(paused.json.message, 'Too many attempts. Please try again later.');
  const other = await call('POST', '/auth/login', { body: { email: `spaced-${tag}@example.com`, password: '  spaced pass  ' } });
  assert.equal(other.status, 200, 'another email is not affected');
  for (let i = 0; i < 12; i++) assert.equal((await call('POST', '/auth/login', { body: { email: `spaced-${tag}@example.com`, password: '  spaced pass  ' } })).status, 200, 'successful sign-ins do not count');
  // sign up: 3 per email per hour
  const repeat = `repeat-${tag}@example.com`;
  const signup = [];
  for (let i = 0; i < 4; i++) signup.push((await call('POST', '/auth/register', { body: { name: 'Repeat', email: repeat, password: 'repeat-pass-1' } })).status);
  assert.deepEqual(signup, [201, 400, 400, 429]);
  // forgot password: 3 per email per hour, 5 per address per 15 minutes
  await resetLimits();
  const fe = `forgot-${tag}@example.com`;
  const forgot = [];
  for (let i = 0; i < 4; i++) forgot.push((await call('POST', '/auth/forgot-password', { body: { email: fe } })).status);
  assert.deepEqual(forgot, [200, 200, 200, 429], 'the 4th request for one email in an hour is refused, known account or not');
  await resetLimits();
  const byIp = [];
  for (let i = 0; i < 7; i++) byIp.push((await call('POST', '/auth/forgot-password', { body: { email: `ip-${i}-${tag}@example.com` } })).status);
  assert.deepEqual(byIp, [200, 200, 200, 200, 200, 429, 429], 'one address may ask 5 times per 15 minutes');
  await flushResetJobs();
  await resetLimits();
  console.log('✓ auth: rate limits per email and per address for sign in, sign up and forgot password');

  // ---- the owner's reset script (its core): only the password changes, all data stays
  const { setPasswordForEmail, passwordMatches } = await import('../src/services/auth/adminReset.js');
  const mine = (await call('POST', '/auth/register', { body: { name: 'Owner', email: `owner-${tag}@example.com`, password: 'owner-old-pass-1' } })).json;
  await db.playlist.create({ data: { name: 'Owner list', userId: mine.user.id, isPublic: false } });
  assert.deepEqual(await passwordMatches(`OWNER-${tag}@example.com`, 'owner-old-pass-1'), { found: true, matches: true });
  assert.deepEqual(await passwordMatches(`owner-${tag}@example.com`, 'something else'), { found: true, matches: false });
  assert.deepEqual(await passwordMatches(`nobody-${tag}@example.com`, 'x'), { found: false, matches: false });
  assert.deepEqual(await setPasswordForEmail(`owner-${tag}@example.com`, 'short'), { ok: false, reason: 'too-short' });
  assert.deepEqual(await setPasswordForEmail(`nobody-${tag}@example.com`, 'long-enough-pass'), { ok: false, reason: 'not-found' });
  await sleep(1100);
  assert.equal((await setPasswordForEmail(`  OWNER-${tag}@example.com `, 'owner-new-pass-9')).ok, true);
  assert.equal((await call('POST', '/auth/login', { body: { email: `owner-${tag}@example.com`, password: 'owner-new-pass-9' } })).status, 200);
  assert.equal((await call('POST', '/auth/login', { body: { email: `owner-${tag}@example.com`, password: 'owner-old-pass-1' } })).status, 401);
  assert.equal((await call('GET', '/auth/me', { token: mine.token })).status, 401, 'the old session ends');
  assert.equal((await db.user.findUnique({ where: { id: mine.user.id } })).name, 'Owner', 'name and the rest are unchanged');
  console.log('✓ auth: the reset-password script changes only the password (all data stays), the verify script is read-only');
} finally {
  server.close();
}
process.exit(0);
