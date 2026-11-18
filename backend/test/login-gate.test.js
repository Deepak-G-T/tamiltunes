import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb, db } from '../src/prisma/client.js';
import { config } from '../src/config/env.js';
import { musicService } from '../src/services/music/providerManager.js';
import jwt from 'jsonwebtoken';

await initDb();
musicService.setProvider('mock');

const server = app.listen(5021);
const BASE = 'http://localhost:5021/api';
const tag = Math.random().toString(36).slice(2, 7);

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, json: ct.includes('json') ? await res.json() : null };
};

const origRequireLogin = config.requireLogin;

try {
  console.log('--- Running Login-First Gate and Roles Verification Tests ---');

  // 1. Gated endpoints return 401 when unauthenticated and REQUIRE_LOGIN=true
  config.requireLogin = true;
  const noTokenHome = await call('GET', '/home');
  assert.equal(noTokenHome.status, 401, 'unauthenticated /home returns 401 when REQUIRE_LOGIN=true');

  const noTokenMusic = await call('GET', '/music/search?query=Anirudh');
  assert.equal(noTokenMusic.status, 401, 'unauthenticated /music/search returns 401 when REQUIRE_LOGIN=true');

  const noTokenPlaylists = await call('GET', '/playlists');
  assert.equal(noTokenPlaylists.status, 401, 'unauthenticated /playlists returns 401 when REQUIRE_LOGIN=true');

  // Health and auth endpoints remain public
  const health = await call('GET', '/health');
  assert.equal(health.status, 200, '/health is public');

  // 2. Gated endpoints return 200 when REQUIRE_LOGIN=false (guest fallback)
  config.requireLogin = false;
  const guestHome = await call('GET', '/home');
  assert.equal(guestHome.status, 200, '/home returns 200 when REQUIRE_LOGIN=false');
  config.requireLogin = true;

  // 3. User registration with throwaway email
  const throwawayEmail = `throwaway_gate_${tag}@example.com`;
  const plainPassword = '  exact password with spaces  '; // leading, internal and trailing spaces
  const regRes = await call('POST', '/auth/register', {
    body: {
      name: 'Gate Tester',
      email: `  ${throwawayEmail.toUpperCase()}  `,
      password: plainPassword,
      role: 'admin', // attacker attempts privilege escalation
      isActive: false
    }
  });

  assert.equal(regRes.status, 201, 'registration succeeds with mixed-case and spaced email');
  assert.equal(regRes.json.user.role, 'user', 'role field injected from client is ignored and defaults to "user"');
  assert.equal(regRes.json.user.isActive, true, 'isActive field injected from client is ignored and defaults to true');
  assert.equal(regRes.json.user.email, throwawayEmail.toLowerCase(), 'saved email is trimmed and lowercased');
  const token = regRes.json.token;

  // 4. Case-insensitive login with exact password
  const loginLower = await call('POST', '/auth/login', {
    body: { email: throwawayEmail.toLowerCase(), password: plainPassword }
  });
  assert.equal(loginLower.status, 200, 'login with lowercase email succeeds');

  const loginUpper = await call('POST', '/auth/login', {
    body: { email: `  ${throwawayEmail.toUpperCase()}  `, password: plainPassword }
  });
  assert.equal(loginUpper.status, 200, 'login with uppercase spaced email succeeds');

  // Password is never trimmed on the server: trimmed version fails
  const loginTrimmedPass = await call('POST', '/auth/login', {
    body: { email: throwawayEmail, password: plainPassword.trim() }
  });
  assert.equal(loginTrimmedPass.status, 401, 'trimmed password fails because password whitespace is preserved');

  // 5. Authenticated user can access gated endpoints
  const authHome = await call('GET', '/home', { token });
  assert.equal(authHome.status, 200, 'authenticated user can access /home');

  // 6. Profile update cannot change role or active status
  const roleInjectionAttempt = await call('PATCH', '/profile/me', {
    token,
    body: { bio: 'New bio', role: 'admin' }
  });
  assert.equal(roleInjectionAttempt.status, 400, 'injected role in profile update is rejected by schema');

  const validProfilePatch = await call('PATCH', '/profile/me', {
    token,
    body: { bio: 'New bio' }
  });
  assert.equal(validProfilePatch.status, 200, 'valid profile patch succeeds');
  const freshMe = await call('GET', '/auth/me', { token });
  assert.equal(freshMe.json.user.role, 'user', 'role remains "user"');

  // 7. Deactivated user cannot log in and active token is rejected
  await db.user.update({
    where: { id: regRes.json.user.id },
    data: { isActive: false }
  });

  const blockedLogin = await call('POST', '/auth/login', {
    body: { email: throwawayEmail, password: plainPassword }
  });
  assert.equal(blockedLogin.status, 403, 'deactivated user cannot log in (403)');

  const blockedTokenAccess = await call('GET', '/home', { token });
  assert.equal(blockedTokenAccess.status, 401, 'deactivated user existing token is rejected (401)');

  // Clean up throwaway user if delete method exists
  if (typeof db.user.delete === 'function') {
    await db.user.delete({ where: { id: regRes.json.user.id } }).catch(() => {});
  }

  console.log('✓ login-first gate: 401 without session, 200 with session, public routes accessible, guest mode configurable');
  console.log('✓ roles: client cannot set role on signup or profile update');
  console.log('✓ auth security: email is case-insensitive, password whitespace strictly preserved, deactivated user blocked');
} finally {
  config.requireLogin = origRequireLogin;
  server.close();
}
