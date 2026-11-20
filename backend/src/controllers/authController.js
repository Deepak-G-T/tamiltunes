import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../prisma/client.js';
import { config, isAdminEmail } from '../config/env.js';
import { verifyGoogleIdToken } from '../services/auth/googleToken.js';
import { suggestUsername } from '../community/username.js';
import { normalizeEmail, hashPassword, verifyPassword, spendTimeLikeAVerify, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '../services/auth/credentials.js';

const emailField = z.string().transform(normalizeEmail).pipe(z.email('Invalid email address'));
const newPassword = z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`).max(MAX_PASSWORD_LENGTH, 'Password is too long');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: emailField,
  password: newPassword // not trimmed: spaces in a password are part of the password
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required').max(MAX_PASSWORD_LENGTH)
});

export const googleLoginSchema = z.object({ idToken: z.string().min(20).max(4096) });

export const generateToken = (userId) => {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
};

export const presentUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username ?? null,
  role: user.role || 'user',
  isActive: user.isActive !== false
});

const EXISTS = { success: false, code: 'EMAIL_EXISTS', message: 'An account with this email already exists' };

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body; // email is already trimmed and lower-cased by the schema

    if (await db.user.findUnique({ where: { email } })) return res.status(400).json(EXISTS);

    const hashedPassword = await hashPassword(password);

    // Unique default username (users can change it later); retry once on the rare collision.
    const makeData = () => ({
      name,
      email,
      password: hashedPassword,
      username: suggestUsername(name, `_${Math.random().toString(36).slice(2, 8)}`)
    });
    let user;
    try {
      user = await db.user.create({ data: makeData() });
    } catch (e) {
      if (e?.code !== 'P2002') throw e;
      // a username clash retries once; an email clash (two signups at the same moment) is "already exists"
      if (String(e?.meta?.target || '').toLowerCase().includes('email')) return res.status(400).json(EXISTS);
      user = await db.user.create({ data: makeData() });
    }

    res.status(201).json({ success: true, token: generateToken(user.id), user: presentUser(user) });
  } catch (err) {
    next(err);
  }
};

const BAD_LOGIN = { success: false, message: 'Invalid email or password' }; // the same answer for a wrong email and a wrong password

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await db.user.findUnique({ where: { email } });

    // Check temporary lockout if configured
    if (user && user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const waitMinutes = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000));
      return res.status(429).json({
        success: false,
        message: `Account is temporarily locked due to failed login attempts. Try again in ${waitMinutes} minute${waitMinutes === 1 ? '' : 's'}.`
      });
    }

    let ok = false;
    if (user) ok = await verifyPassword(password, user.password);
    else await spendTimeLikeAVerify(password);

    if (!ok) {
      if (user) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const updateData = { failedLoginAttempts: attempts };
        if (attempts >= 10) {
          // Lock for 15 minutes after 10 consecutive failures (aligning with login rate limit)
          updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        }
        await db.user.update({
          where: { id: user.id },
          data: updateData
        }).catch(() => {});
      }
      return res.status(401).json(BAD_LOGIN);
    }

    // Check account active status
    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated' });
    }

    // Reset failed login counter on successful authentication
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null }
      }).catch(() => {});
    }

    res.json({ success: true, token: generateToken(user.id), user: presentUser(user) });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res, next) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (err) {
    next(err);
  }
};

/** Email + password sign-in only exists outside production (or with PASSWORD_AUTH=true). In production the answer is "use Google". */
export const requirePasswordAuth = (req, res, next) => {
  if (config.passwordAuth) return next();
  return res.status(404).json({ success: false, code: 'GOOGLE_ONLY', message: 'Sign in with Google' });
};

const GOOGLE_FAIL = { success: false, message: 'Google sign-in could not be verified' };

/**
 * POST /api/auth/google { idToken }: the ONLY way to sign in in production.
 * The browser (Google button) or the Android app (native Google sign-in) gets an ID token from Google; we verify it ourselves,
 * find the person by Google id (or link an existing account that has the same verified email), and hand back our own session token.
 */
export const googleLogin = async (req, res, next) => {
  try {
    if (!config.googleClientIds.length) {
      return res.status(503).json({ success: false, code: 'GOOGLE_NOT_CONFIGURED', message: 'Google sign-in is not set up yet' });
    }
    const verified = await verifyGoogleIdToken(req.body.idToken, { clientIds: config.googleClientIds });
    if (!verified.ok) {
      console.warn('Google sign-in refused:', verified.reason);
      return res.status(verified.reason === 'keys_unavailable' ? 503 : 401).json(GOOGLE_FAIL);
    }
    const { sub, email, name } = verified.claims;

    let user = await db.user.findUnique({ where: { googleSub: sub } });
    if (!user) {
      const byEmail = await db.user.findUnique({ where: { email } });
      if (byEmail) {
        if (byEmail.googleSub && byEmail.googleSub !== sub) {
          return res.status(403).json({ success: false, message: 'This account is linked to a different Google account' });
        }
        user = byEmail; // an account made before Google sign-in: same verified email, so it is the same person
      }
    }
    if (user && user.isActive === false) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated' });
    }

    const now = new Date();
    const wantsAdmin = isAdminEmail(email);
    if (!user) {
      const displayName = name.length >= 2 ? name : email.split('@')[0];
      const makeData = () => ({
        name: displayName,
        email,
        password: null,
        googleSub: sub,
        role: wantsAdmin ? 'admin' : 'user',
        lastLoginAt: now,
        lastSeenAt: now,
        username: suggestUsername(displayName, `_${Math.random().toString(36).slice(2, 8)}`)
      });
      try {
        user = await db.user.create({ data: makeData() });
      } catch (e) {
        if (e?.code !== 'P2002') throw e;
        user = await db.user.create({ data: makeData() }); // a username clash: once more with another suffix
      }
    } else {
      const data = { googleSub: sub, lastLoginAt: now, lastSeenAt: now, failedLoginAttempts: 0, lockedUntil: null };
      if (!config.passwordAuth && user.password) data.password = null; // Google only: an old password can no longer be used for anything
      if (wantsAdmin && user.role !== 'admin') data.role = 'admin';
      if (!wantsAdmin && config.adminEmailsEnforced && user.role === 'admin') data.role = 'user'; // no longer on the admin list
      user = await db.user.update({ where: { id: user.id }, data });
    }

    res.json({ success: true, token: generateToken(user.id), user: presentUser(user) });
  } catch (err) {
    next(err);
  }
};
