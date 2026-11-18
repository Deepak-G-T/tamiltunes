import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../prisma/client.js';
import { config } from '../config/env.js';
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

export const generateToken = (userId) => {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
};

export const presentUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username ?? null
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

    let ok = false;
    if (user) ok = await verifyPassword(password, user.password);
    else await spendTimeLikeAVerify(password);
    if (!ok) return res.status(401).json(BAD_LOGIN);

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
