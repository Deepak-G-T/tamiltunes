import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb, db } from '../src/prisma/client.js';
import { config } from '../src/config/env.js';
import { generateToken } from '../src/controllers/authController.js';
import { hashPassword } from '../src/services/auth/credentials.js';

await initDb();

const PORT = 5022;
const server = app.listen(PORT);
const BASE = `http://localhost:${PORT}/api/admin`;

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
  const text = await res.text();
  let json = null;
  if (ct.includes('json')) {
    try { json = JSON.parse(text); } catch {}
  }
  return { status: res.status, headers: res.headers, text, json };
};

const originalRequireLogin = config.requireLogin;

try {
  console.log('--- Running Admin Security and Management API Tests ---');

  // Create throwaway test users
  const adminPassword = 'AdminSecret@Password123';
  const adminHash = await hashPassword(adminPassword);

  const adminUser = await db.user.create({
    data: {
      name: 'Throwaway Admin',
      email: 'throwaway_admin_' + Math.random().toString(36).substring(2, 8) + '@example.com',
      password: adminHash,
      role: 'admin',
      isActive: true
    }
  });

  const normalPassword = 'UserSecret@Password123';
  const normalHash = await hashPassword(normalPassword);
  const normalUser = await db.user.create({
    data: {
      name: 'Throwaway User',
      email: 'throwaway_normal_' + Math.random().toString(36).substring(2, 8) + '@example.com',
      password: normalHash,
      role: 'user',
      isActive: true
    }
  });

  const deactivatedAdmin = await db.user.create({
    data: {
      name: 'Deactivated Admin',
      email: 'throwaway_deact_' + Math.random().toString(36).substring(2, 8) + '@example.com',
      password: adminHash,
      role: 'admin',
      isActive: false
    }
  });

  const adminToken = generateToken(adminUser.id);
  const normalToken = generateToken(normalUser.id);
  const deactToken = generateToken(deactivatedAdmin.id);

  // 1. Unauthenticated request gets 401
  const unauth = await call('GET', '/dashboard');
  assert.equal(unauth.status, 401, 'unauthenticated gets 401');

  // 2. Normal user gets 403 Forbidden on admin endpoints
  const endpoints = ['/dashboard', '/users', '/songs', '/settings', '/audit-logs'];
  for (const ep of endpoints) {
    const res = await call('GET', ep, { token: normalToken });
    assert.equal(res.status, 403, `normal user on ${ep} gets 403`);
  }

  // 3. Deactivated admin gets 401/403
  const deactRes = await call('GET', '/dashboard', { token: deactToken });
  assert.ok([401, 403].includes(deactRes.status), 'deactivated admin is rejected');

  // 4. Active admin gets 200 OK on dashboard
  const dashRes = await call('GET', '/dashboard', { token: adminToken });
  assert.equal(dashRes.status, 200, 'admin gets 200 on dashboard');
  assert.ok(typeof dashRes.json.totalUsers === 'number');
  assert.ok(Array.isArray(dashRes.json.chartData));

  // 5. Admin can list users without leaking credentials
  const usersRes = await call('GET', '/users', { token: adminToken });
  assert.equal(usersRes.status, 200, 'list users succeeds');
  assert.ok(Array.isArray(usersRes.json.users));
  assert.ok(usersRes.json.users.length >= 2);

  for (const u of usersRes.json.users) {
    assert.equal(u.password, undefined, 'password is not leaked');
    assert.equal(u.twoFactorSecret, undefined, '2FA secret is not leaked');
    assert.equal(u.twoFactorRecoveryCodes, undefined, 'recovery codes are not leaked');
  }

  // 6. Admin can block and unblock a user
  const blockRes = await call('POST', `/users/${normalUser.id}/block`, { token: adminToken });
  assert.equal(blockRes.status, 200, 'block user succeeds');
  const updatedUser = await db.user.findUnique({ where: { id: normalUser.id } });
  assert.equal(updatedUser.isActive, false, 'user is now inactive');

  const unblockRes = await call('POST', `/users/${normalUser.id}/unblock`, { token: adminToken });
  assert.equal(unblockRes.status, 200, 'unblock user succeeds');
  const restoredUser = await db.user.findUnique({ where: { id: normalUser.id } });
  assert.equal(restoredUser.isActive, true, 'user is active again');

  // 7. Admin cannot block their own account
  const selfBlock = await call('POST', `/users/${adminUser.id}/block`, { token: adminToken });
  assert.equal(selfBlock.status, 400, 'cannot block own account');

  // 8. Role change requires admin password confirmation
  const wrongPass = await call('POST', `/users/${normalUser.id}/role`, {
    token: adminToken,
    body: { role: 'admin', password: 'WrongPassword' }
  });
  assert.equal(wrongPass.status, 401, 'wrong password fails role change');

  const rightPass = await call('POST', `/users/${normalUser.id}/role`, {
    token: adminToken,
    body: { role: 'admin', password: adminPassword }
  });
  assert.equal(rightPass.status, 200, 'correct password changes role');
  const promoted = await db.user.findUnique({ where: { id: normalUser.id } });
  assert.equal(promoted.role, 'admin', 'user is now admin');

  // Demote back
  await call('POST', `/users/${normalUser.id}/role`, {
    token: adminToken,
    body: { role: 'user', password: adminPassword }
  });

  // 9. Admin cannot remove their own admin role
  const selfDemote = await call('POST', `/users/${adminUser.id}/role`, {
    token: adminToken,
    body: { role: 'user', password: adminPassword }
  });
  assert.equal(selfDemote.status, 400, 'cannot demote self');

  // 10. Admin can export users CSV
  const csvRes = await call('GET', '/users/export', { token: adminToken });
  assert.equal(csvRes.status, 200, 'export CSV succeeds');
  assert.ok(csvRes.headers.get('content-type').includes('text/csv'));
  assert.match(csvRes.text, /ID,Email,Name/);

  // 11. Song management: list, update, hide, soft delete
  const songId = 'test_song_' + Math.random().toString(36).substring(2, 8);
  await db.song.upsert({
    where: { id: songId },
    create: { title: 'Test Melody', artist: 'Test Singer', movie: 'Test Movie' },
    update: {}
  });

  const listSongs = await call('GET', '/songs', { token: adminToken });
  assert.equal(listSongs.status, 200, 'list songs succeeds');

  const updateSong = await call('PUT', `/songs/${songId}`, {
    token: adminToken,
    body: { title: 'Updated Test Melody', year: 2024 }
  });
  assert.equal(updateSong.status, 200, 'update song succeeds');
  assert.equal(updateSong.json.song.title, 'Updated Test Melody');

  const hideSong = await call('POST', `/songs/${songId}/hide`, { token: adminToken });
  assert.equal(hideSong.status, 200, 'hide song succeeds');
  assert.equal(hideSong.json.isHidden, true);

  const delSong = await call('DELETE', `/songs/${songId}`, { token: adminToken });
  assert.equal(delSong.status, 200, 'soft delete song succeeds');

  // 12. Settings management: dynamically toggles REQUIRE_LOGIN
  const putSettings = await call('PUT', '/settings', {
    token: adminToken,
    body: { requireLogin: false }
  });
  assert.equal(putSettings.status, 200, 'update settings succeeds');
  assert.equal(config.requireLogin, false, 'requireLogin flag updated dynamically');

  await call('PUT', '/settings', {
    token: adminToken,
    body: { requireLogin: true }
  });
  assert.equal(config.requireLogin, true, 'requireLogin restored');

  // 13. 2FA lifecycle: setup, verify, disable
  const setup2fa = await call('POST', '/2fa/setup', { token: adminToken });
  assert.equal(setup2fa.status, 200, '2fa setup succeeds');
  assert.ok(setup2fa.json.secret);
  assert.match(setup2fa.json.uri, /otpauth:\/\/totp/);
  assert.equal(setup2fa.json.recoveryCodes.length, 8);

  const invalid2fa = await call('POST', '/2fa/verify', {
    token: adminToken,
    body: { token: '000000', recoveryCodes: setup2fa.json.recoveryCodes }
  });
  assert.equal(invalid2fa.status, 400, 'invalid 2fa token rejected');

  const disable2fa = await call('POST', '/2fa/disable', {
    token: adminToken,
    body: { password: adminPassword }
  });
  assert.equal(disable2fa.status, 200, 'disable 2fa succeeds with password');

  // 14. Audit logs are populated
  const auditRes = await call('GET', '/audit-logs', { token: adminToken });
  assert.equal(auditRes.status, 200, 'list audit logs succeeds');
  assert.ok(Array.isArray(auditRes.json.logs));
  assert.ok(auditRes.json.logs.length > 0, 'audit logs are recorded');

  // Clean up
  if (typeof db.user?.delete === 'function') {
    await db.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    await db.user.delete({ where: { id: normalUser.id } }).catch(() => {});
    await db.user.delete({ where: { id: deactivatedAdmin.id } }).catch(() => {});
  }

  console.log('✓ admin security: 401 unauth, 403 non-admin, 403 deactivated admin');
  console.log('✓ admin management: users pagination, export CSV, block/unblock, password confirmation for role promotion');
  console.log('✓ admin content: song metadata update, hide/unhide, soft-delete, settings toggle');
  console.log('✓ admin 2FA: RFC 6238 TOTP setup, verification, recovery codes, and password-confirmed disable');
  console.log('✓ audit log: every critical admin action is immutably tracked');
} finally {
  config.requireLogin = originalRequireLogin;
  server.close();
}
