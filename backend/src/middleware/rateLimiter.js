import rateLimit from 'express-rate-limit';
import { normalizeEmail } from '../services/auth/credentials.js';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 login/signup attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes'
  }
});

// Single-song lookups may trigger an upstream video lookup, so keep them tighter than /api
export const songLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many song lookups, please slow down'
  }
});

const perUser = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Mount after requireAuth so the key is the account, not a shared NAT address.
    keyGenerator: (req) => (req.user?.id ? `u:${req.user.id}` : `ip:${req.ip}`),
    message: { success: false, message },
  });

// 5 new comments or replies per minute per account
export const commentLimiter = perUser({
  windowMs: 60 * 1000,
  max: 5,
  message: 'You are commenting too fast. Please wait a minute and try again.',
});

// A failed video embed is reported once per song; 20 an hour per account is plenty and stops anyone flagging the catalogue
export const videoReportLimiter = perUser({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many video reports, please try again later.',
});

export const reportLimiter = perUser({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many reports, please slow down.',
});

export const usernameCheckLimiter = perUser({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many username checks, please slow down.',
});

// Radio refills: one batch per few songs per listener, so 60/min is generous but stops scraping
export const relatedLimiter = perUser({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many radio requests, please slow down.',
});

// Play reports: one per song play (plus the odd skip), so 120/min per listener is far above normal use
export const playEventLimiter = perUser({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many play reports, please slow down.',
});

// Speed Dial edits (pin, hide, reorder, import)
export const speedDialWriteLimiter = perUser({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many Speed Dial changes, please slow down.',
});

// Saving the queue: the app already waits about 2 s between saves; this is the server-side ceiling
export const queueWriteLimiter = perUser({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Saving the queue too often, please slow down.',
});

// Turning ids into songs for guests (may ask the music provider): modest per-address ceiling
export const resolveLimiter = perUser({
  windowMs: 60 * 1000,
  max: 12,
  message: 'Too many requests, please slow down.',
});

// Saving a whole queue as a playlist
export const playlistBulkLimiter = perUser({
  windowMs: 60 * 1000,
  max: 6,
  message: 'Too many playlists created, please slow down.',
});

// The home page is assembled from cached data, but still: a modest per-address ceiling
export const homeLimiter = perUser({
  windowMs: 60 * 1000,
  max: 40,
  message: 'Too many requests, please slow down.',
});

// ---- sign in / sign up / password reset: limits per address AND per email (mount after the body is validated, so the email is normalised)
const perEmail = ({ windowMs, max, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.body?.email ? `e:${normalizeEmail(req.body.email)}` : `ip:${req.ip}`),
    message: { success: false, message: 'Too many attempts. Please try again later.' }, // the same for every email: says nothing about the account
  });

const perAddress = ({ windowMs, max, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `ip:${req.ip}`,
    message: { success: false, message: 'Too many attempts. Please try again later.' },
  });

export const loginEmailLimiter = perEmail({ windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true }); // 10 wrong tries per email per 15 min
export const loginIpLimiter = perAddress({ windowMs: 15 * 60 * 1000, max: 30, skipSuccessfulRequests: true });
export const registerEmailLimiter = perEmail({ windowMs: 60 * 60 * 1000, max: 3 });
export const registerIpLimiter = perAddress({ windowMs: 60 * 60 * 1000, max: 10 });
export const forgotEmailLimiter = perEmail({ windowMs: 60 * 60 * 1000, max: 3 });
export const forgotIpLimiter = perAddress({ windowMs: 15 * 60 * 1000, max: 5 });
export const resetIpLimiter = perAddress({ windowMs: 15 * 60 * 1000, max: 10 });

// Google sign-in: each attempt costs us a token check, so keep it tight per IP
export const googleLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many sign-in attempts, please try again after 15 minutes' }
});
