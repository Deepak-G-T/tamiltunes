import { getStore } from '../community/store/index.js';
import { validateUsername } from '../community/username.js';
import { validateAvatarDataUrl } from '../community/avatar.js';
import { checkContent, FILTER_MESSAGES } from '../community/contentFilter.js';
import { presentOwnProfile } from '../community/presenters.js';
import { db } from '../prisma/client.js';
import { verifyPassword } from '../services/auth/credentials.js';
import { config } from '../config/env.js';

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

export const getMyProfile = async (req, res, next) => {
  try {
    const store = getStore();
    const user = await store.getUser(req.user.id);
    if (!user) return fail(res, 404, 'User not found');
    res.json({ success: true, profile: presentOwnProfile(user, await store.userStats(user.id)) });
  } catch (err) { next(err); }
};

export const updateMyProfile = async (req, res, next) => {
  try {
    const store = getStore();
    const body = req.body;
    const data = {};

    for (const k of ['name', 'bio', 'location', 'genres', 'favoriteArtists', 'language', 'isPublicProfile', 'showHistory']) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (data.bio === '') data.bio = null;
    if (data.location === '') data.location = null;

    // Free-text fields shown to others go through the same filter as comments
    for (const text of [data.name, data.bio, data.location, ...(data.genres || []), ...(data.favoriteArtists || [])]) {
      const verdict = text ? checkContent(text) : { ok: true };
      if (!verdict.ok) return fail(res, 422, FILTER_MESSAGES[verdict.reason], { reason: verdict.reason });
    }

    if (body.username !== undefined) {
      const v = validateUsername(body.username);
      if (!v.ok) return fail(res, 400, v.message, { field: 'username' });
      if (await store.isUsernameTaken(v.value, req.user.id)) {
        return fail(res, 409, 'That username is already taken', { field: 'username' });
      }
      data.username = v.value;
    }

    if (body.avatar !== undefined) {
      if (body.avatar === null) {
        data.avatar = null;
        data.avatarUpdatedAt = null;
      } else {
        const v = validateAvatarDataUrl(body.avatar);
        if (!v.ok) return fail(res, 400, v.message, { field: 'avatar' });
        data.avatar = v.value;
        data.avatarUpdatedAt = new Date();
      }
    }

    let user;
    try {
      user = await store.updateUser(req.user.id, data);
    } catch (e) {
      // Two people claiming the same username at once: the unique index decides
      if (e?.code === 'P2002') return fail(res, 409, 'That username is already taken', { field: 'username' });
      throw e;
    }
    res.json({ success: true, profile: presentOwnProfile(user, await store.userStats(user.id)) });
  } catch (err) { next(err); }
};

export const checkUsername = async (req, res, next) => {
  try {
    const v = validateUsername(req.query.u);
    if (!v.ok) return res.json({ success: true, available: false, message: v.message });
    const taken = await getStore().isUsernameTaken(v.value, req.user.id);
    res.json({ success: true, available: !taken, message: taken ? 'That username is already taken' : undefined });
  } catch (err) { next(err); }
};

export const deleteMyAccount = async (req, res, next) => {
  try {
    // Re-check who is asking: a stolen token alone must not be able to destroy an account.
    // Google accounts have no password: they type their own email address to confirm.
    const row = await db.user.findUnique({ where: { id: req.user.id } });
    if (!row) return fail(res, 403, 'Account not found');
    if (row.password && config.passwordAuth) {
      if (!(await verifyPassword(req.body.password, row.password))) return fail(res, 403, 'Incorrect password');
    } else if (String(req.body.confirmEmail || '').trim().toLowerCase() !== String(row.email).toLowerCase()) {
      return fail(res, 403, 'Type your email address to confirm');
    }
    await getStore().deleteUser(req.user.id);
    res.json({ success: true });
  } catch (err) { next(err); }
};
