import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { db } from '../prisma/client.js';

const PRESENCE_EVERY_MS = 60 * 1000;
/** "Online now" in the admin panel: remember the last request, at most once a minute per person (a failed write never breaks the request). */
export const touchLastSeen = (user, now = Date.now()) => {
  if (user.lastSeenAt && now - new Date(user.lastSeenAt).getTime() < PRESENCE_EVERY_MS) return;
  Promise.resolve(db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(now) } })).catch(() => {});
};

/** A token issued before the last password change is no longer accepted (a reset signs everyone else out). */
export const tokenPredatesPasswordChange = (decoded, user) =>
  Boolean(user.passwordChangedAt) && Number(decoded.iat) < Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    const user = await db.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists'
      });
    }

    if (user.isActive === false) {
      return res.status(401).json({ success: false, message: 'Account has been deactivated' });
    }

    if (tokenPredatesPasswordChange(decoded, user)) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session token' }); // signed in before the password was changed
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username ?? null,
      role: user.role || 'user',
      isActive: user.isActive !== false
    };
    touchLastSeen(user);

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session token'
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await db.user.findUnique({ where: { id: decoded.userId } });
      if (user && user.isActive !== false && !tokenPredatesPasswordChange(decoded, user)) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username ?? null,
          role: user.role || 'user',
          isActive: true
        };
      }
    }
  } catch (err) {
    // Ignore error for optional auth
  }
  next();
};

/**
 * Gate that protects API endpoints when REQUIRE_LOGIN=true.
 * When REQUIRE_LOGIN=false, acts as optionalAuth allowing guest browsing.
 */
export const loginGate = (req, res, next) => {
  if (config.requireLogin) {
    return requireAuth(req, res, next);
  }
  return optionalAuth(req, res, next);
};
