import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { initDb, db } from '../src/prisma/client.js';
import { config } from '../src/config/env.js';
import { musicService } from '../src/services/music/providerManager.js';
import { verifyGoogleIdToken, setGoogleKeyFetcher, resetGoogleKeyCache } from '../src/services/auth/googleToken.js';
import { hashPassword } from '../src/services/auth/credentials.js';

await initDb();
musicService.setProvider('mock');
const CLIENT = 'test-web-client.apps.googleusercontent.com';
const ANDROID = 'test-android-client.apps.googleusercontent.com';
const ADMIN_EMAIL = 'owner.admin@example.com';
const tag = Math.random().toString(36).slice(2, 7);

// ---- a fake Google: our own RSA key, published as the "Google keys"
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
let keyFetches = 0;
setGoogleKeyFetcher(async () => { keyFetches += 1; return [jwk]; });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const nowSec = () => Math.floor(Date.now() / 1000);
const sign = (claims, { key = privateKey, header = { alg: 'RS256', kid: 'k1', typ: 'JWT' } } = {}) => {
  const data = `${b64(header)}.${b64(claims)}`;
  return `${data}.${crypto.sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
};
const claimsFor = (over = {}) => ({ iss: 'https://accounts.google.com', aud: CLIENT, sub: `sub-${tag}-1`, email: `person.${tag}@example.com`, email_verified: true, name: 'Test Person', picture: 'https://example.com/p.png', iat: nowSec(), exp: nowSec() + 3600, ...over });

// ---- 1. the token check on its own
{
  const ok = await verifyGoogleIdToken(sign(claimsFor()), { clientIds: [CLIENT] });
  assert.equal(ok.ok, true); assert.equal(ok.claims.email, `person.${tag}@example.com`);
  assert.equal((await verifyGoogleIdToken(sign(claimsFor({ aud: ANDROID })), { clientIds: [CLIENT, ANDROID] })).ok, true, 'either of our client ids is accepted');
  const bad = async (token, why, ids = [CLIENT]) => { const r = await verifyGoogleIdToken(token, { clientIds: ids }); assert.equal(r.ok, false, why); return r.reason; };
  assert.equal(await bad(sign(claimsFor({ aud: 'someone-elses-client' })), 'a token made for another app'), 'bad_audience');
  assert.equal(await bad(sign(claimsFor({ exp: nowSec() - 3600 })), 'expired'), 'expired');
  assert.equal(await bad(sign(claimsFor({ iss: 'https://evil.example' })), 'wrong issuer'), 'bad_issuer');
  assert.equal(await bad(sign(claimsFor({ email_verified: false })), 'unverified email'), 'email_not_verified');
  assert.equal(await bad(sign(claimsFor({ email: undefined })), 'no email'), 'no_email');
  assert.equal(await bad(sign(claimsFor(), { key: otherKey.privateKey }), 'signed with a different key'), 'bad_signature');
  assert.equal(await bad(sign(claimsFor(), { header: { alg: 'none', kid: 'k1' } }), 'alg none'), 'bad_header');
  assert.equal(await bad(sign(claimsFor(), { header: { alg: 'HS256', kid: 'k1' } }), 'a symmetric algorithm'), 'bad_header');
  assert.equal(await bad(sign(claimsFor(), { header: { alg: 'RS256', kid: 'nope' } }), 'unknown key id'), 'unknown_key');
  const parts = sign(claimsFor()).split('.');
  assert.equal(await bad(`${parts[0]}.${b64(claimsFor({ email: 'attacker@example.com' }))}.${parts[2]}`, 'payload changed after signing'), 'bad_signature');
  assert.equal(await bad('not.a.token', 'garbage'), 'malformed');
  assert.equal(await bad('x'.repeat(5000), 'too long'), 'malformed');
  assert.equal(await bad(sign(claimsFor()), 'no client id configured: nothing is accepted', []), 'not_configured');
  resetGoogleKeyCache(); keyFetches = 0;
  await verifyGoogleIdToken(sign(claimsFor()), { clientIds: [CLIENT] }); await verifyGoogleIdToken(sign(claimsFor()), { clientIds: [CLIENT] });
  assert.equal(keyFetches, 1, "Google's keys are fetched once and kept");
  console.log('✓ google token: signature, issuer, audience, expiry, verified email, alg none / HS256, tampering, missing client id, key cache');
}

// ---- 2. the API
config.googleClientIds = [CLIENT, ANDROID];
config.adminEmails = new Set([ADMIN_EMAIL]);
config.adminEmailsEnforced = true;
config.passwordAuth = false;
config.requireLogin = true;
const server = app.listen(5033);
const BASE = 'http://localhost:5033/api';
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, json: ct.includes('json') ? await res.json() : null };
};
const google = (over, opts) => call('POST', '/auth/google', { body: { idToken: sign(claimsFor(over), opts) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // not configured
  config.googleClientIds = [];
  assert.equal((await google()).status, 503, 'no client id on the server: "not set up", nothing is accepted');
  config.googleClientIds = [CLIENT, ANDROID];

  // new person
  const first = await google();
  assert.equal(first.status, 200); assert.ok(first.json.token); assert.equal(first.json.user.role, 'user'); assert.equal(first.json.user.email, `person.${tag}@example.com`);
  const row = await db.user.findUnique({ where: { email: `person.${tag}@example.com` } });
  assert.equal(row.googleSub, `sub-${tag}-1`); assert.ok(!row.password, 'no password for a Google account'); assert.ok(row.username, 'a username is made'); assert.ok(row.lastLoginAt);
  assert.equal((await call('GET', '/auth/me', { token: first.json.token })).json.user.id, row.id, 'the session token works');
  const again = await google();
  assert.equal(again.json.user.id, row.id, 'the same Google account is the same person');
  console.log('✓ google sign-in: a new person is created, the same Google account is the same person, the session token works');

  // bad tokens
  for (const [name, over, opts] of [['wrong audience', { aud: 'other' }], ['expired', { exp: nowSec() - 600 }], ['unverified email', { email_verified: false }], ['other key', {}, { key: otherKey.privateKey }]]) {
    const r = await google(over, opts);
    assert.equal(r.status, 401, name); assert.equal(r.json.token, undefined);
  }
  assert.equal((await call('POST', '/auth/google', { body: { idToken: 'short' } })).status, 400, 'a malformed body is refused');
  console.log('✓ google sign-in: wrong audience, expired, unverified email and a forged signature are all refused (401)');

  // an account made before Google sign-in is linked by its verified email and keeps its data
  const oldEmail = `old.${tag}@example.com`;
  const old = await db.user.create({ data: { name: 'Old Account', email: oldEmail, password: await hashPassword('old-password-123'), username: `old_${tag}` } });
  const linked = await google({ sub: `sub-${tag}-old`, email: oldEmail });
  assert.equal(linked.json.user.id, old.id, 'linked to the existing account');
  const linkedRow = await db.user.findUnique({ where: { id: old.id } });
  assert.equal(linkedRow.googleSub, `sub-${tag}-old`); assert.equal(linkedRow.password, null, 'the old password is removed: Google only');
  assert.equal(linkedRow.username, `old_${tag}`, 'profile data is kept');
  assert.equal((await google({ sub: `sub-${tag}-different`, email: oldEmail })).status, 403, 'another Google account cannot take over a linked email');
  console.log('✓ google sign-in: an existing account is linked by verified email (data kept, password removed); a different Google id cannot take it over');

  // blocked
  await db.user.update({ where: { id: old.id }, data: { isActive: false } });
  assert.equal((await google({ sub: `sub-${tag}-old`, email: oldEmail })).status, 403, 'a blocked account cannot sign in');
  await db.user.update({ where: { id: old.id }, data: { isActive: true } });

  // password routes are gone
  for (const [path, body] of [['/auth/register', { name: 'X Y', email: `n.${tag}@example.com`, password: 'password-12345' }], ['/auth/login', { email: oldEmail, password: 'old-password-123' }], ['/auth/forgot-password', { email: oldEmail }], ['/auth/reset-password', { token: 'x'.repeat(40), password: 'password-12345' }]]) {
    const r = await call('POST', path, { body });
    assert.equal(r.status, 404, path); assert.equal(r.json.code, 'GOOGLE_ONLY');
  }
  console.log('✓ email + password routes answer 404 "Sign in with Google" when password sign-in is off');

  // admin: only the listed Google account
  const adminLogin = await google({ sub: `sub-${tag}-admin`, email: ADMIN_EMAIL, name: 'Owner Admin' });
  assert.equal(adminLogin.json.user.role, 'admin', 'the listed email becomes admin at sign-in');
  const adminToken = adminLogin.json.token;
  assert.equal((await call('GET', '/admin/users', { token: adminToken })).status, 200);
  assert.equal((await call('GET', '/admin/users', { token: first.json.token })).status, 403, 'a normal Google user is not admin');
  const sneaky = await db.user.create({ data: { name: 'Sneaky Admin', email: `sneaky.${tag}@example.com`, password: null, role: 'admin', username: `sneaky_${tag}` } });
  const sneakyToken = (await import('../src/controllers/authController.js')).generateToken(sneaky.id);
  assert.equal((await call('GET', '/admin/users', { token: sneakyToken })).status, 403, 'role admin in the database is not enough: the email must be on ADMIN_EMAILS');
  const demoted = await google({ sub: `sub-${tag}-sneaky`, email: `sneaky.${tag}@example.com` });
  assert.equal(demoted.json.user.role, 'user', 'an admin who is not on the list is demoted at sign-in');
  config.adminEmails = new Set();
  assert.equal((await call('GET', '/admin/users', { token: adminToken })).status, 403, 'empty list: nobody is admin (fail closed)');
  config.adminEmails = new Set([ADMIN_EMAIL]);
  console.log('✓ admin: only the Google account(s) on ADMIN_EMAILS; a database role alone is refused; others are demoted; an empty list means nobody');

  // presence: "who is logged in"
  await call('GET', '/auth/me', { token: first.json.token });
  await sleep(150);
  const seen = await db.user.findUnique({ where: { id: row.id } });
  assert.ok(seen.lastSeenAt, 'a request records the last time the person was seen');
  const list = await call('GET', '/admin/users?online=1', { token: adminToken });
  assert.equal(list.status, 200);
  const me = list.json.users.find((u) => u.id === row.id);
  assert.ok(me && me.online === true && me.signsInWithGoogle === true, 'the Online filter lists the person as online');
  const stale = await db.user.create({ data: { name: 'Sleeping User', email: `sleep.${tag}@example.com`, password: null, username: `sleep_${tag}`, lastSeenAt: new Date(Date.now() - 3600 * 1000) } });
  assert.ok(!(await call('GET', '/admin/users?online=1', { token: adminToken })).json.users.some((u) => u.id === stale.id), 'someone last seen an hour ago is not online');
  const all = await call('GET', `/admin/users?search=${encodeURIComponent('sleep.' + tag)}`, { token: adminToken });
  assert.equal(all.json.users[0].online, false);
  assert.ok((await call('GET', '/admin/dashboard', { token: adminToken })).json.onlineNow >= 1, 'the dashboard counts people online now');
  console.log('✓ presence: last-seen is recorded, the Online filter and the "online" flag are right, the dashboard counts online now');

  // terminate = force logout, then block, then remove
  await sleep(1100); // a token and a termination in the same second would not be told apart: wait one second
  assert.equal((await call('POST', `/admin/users/${row.id}/force-logout`, { token: adminToken })).status, 200);
  assert.equal((await call('GET', '/auth/me', { token: first.json.token })).status, 401, 'after "terminate" the old session token no longer works');
  const relogin = await google();
  assert.equal(relogin.status, 200, 'but the person can sign in again with Google');
  assert.equal((await call('POST', `/admin/users/${row.id}/block`, { token: adminToken })).status, 200);
  assert.equal((await call('GET', '/auth/me', { token: relogin.json.token })).status, 401, 'blocked: the session stops at once');
  assert.equal((await google()).status, 403, 'blocked: Google sign-in is refused');
  await call('POST', `/admin/users/${row.id}/unblock`, { token: adminToken });

  // remove account
  assert.equal((await call('DELETE', `/admin/users/${row.id}`, { token: relogin.json.token, body: { confirmEmail: row.email } })).status, 403, 'a normal user cannot remove accounts');
  assert.equal((await call('DELETE', `/admin/users/${row.id}`, { token: adminToken, body: {} })).status, 400, 'typed confirmation is required');
  assert.equal((await call('DELETE', `/admin/users/${row.id}`, { token: adminToken, body: { confirmEmail: 'wrong@example.com' } })).status, 400);
  assert.equal((await call('DELETE', `/admin/users/${adminLogin.json.user.id}`, { token: adminToken, body: { confirmEmail: ADMIN_EMAIL } })).status, 400, 'an admin cannot remove themselves');
  const otherAdmin = await db.user.create({ data: { name: 'Other Admin', email: `other.admin.${tag}@example.com`, password: null, role: 'admin', username: `oa_${tag}` } });
  assert.equal((await call('DELETE', `/admin/users/${otherAdmin.id}`, { token: adminToken, body: { confirmEmail: otherAdmin.email } })).status, 400, 'an admin account is not removed here');
  const gone = await call('DELETE', `/admin/users/${row.id}`, { token: adminToken, body: { confirmEmail: row.email.toUpperCase() } });
  assert.equal(gone.status, 200, 'the typed email is compared without caring about capitals');
  assert.equal(await db.user.findUnique({ where: { id: row.id } }), null, 'the account is gone');
  assert.equal((await call('GET', '/auth/me', { token: relogin.json.token })).status, 401, 'its token no longer works');
  const logs = await call('GET', '/admin/audit-logs', { token: adminToken });
  assert.ok(JSON.stringify(logs.json).includes('USER_DELETE') && JSON.stringify(logs.json).includes('USER_FORCE_LOGOUT') && JSON.stringify(logs.json).includes('USER_BLOCK'), 'terminate, block and remove are in the audit log');
  console.log('✓ admin: terminate (force logout), block and remove account work; removal needs the typed email, never yourself or an admin; all are audit-logged');

  // role change needs the allow-list and a typed confirmation (no password for a Google admin)
  const target = await db.user.create({ data: { name: 'Promote Me', email: `promote.${tag}@example.com`, password: null, username: `pm_${tag}` } });
  assert.equal((await call('POST', `/admin/users/${target.id}/role`, { token: adminToken, body: { role: 'admin' } })).status, 401, 'type CONFIRM is required');
  assert.equal((await call('POST', `/admin/users/${target.id}/role`, { token: adminToken, body: { role: 'admin', confirm: 'CONFIRM' } })).status, 400, 'an email not on ADMIN_EMAILS cannot be promoted in the app');
  console.log('✓ admin: promotion needs CONFIRM and an email already on ADMIN_EMAILS');

  // deleting your own account: type your email
  const mine = await google({ sub: `sub-${tag}-mine`, email: `mine.${tag}@example.com` });
  assert.equal((await call('DELETE', '/profile/me', { token: mine.json.token, body: { confirmEmail: 'wrong@example.com' } })).status, 403);
  assert.equal((await call('DELETE', '/profile/me', { token: mine.json.token, body: { confirmEmail: `mine.${tag}@example.com` } })).status, 200);
  assert.equal((await call('GET', '/auth/me', { token: mine.json.token })).status, 401);
  console.log('✓ a person can delete their own account by typing their email');
} finally {
  server.close();
}
process.exit(0);
