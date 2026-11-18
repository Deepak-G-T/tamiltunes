import rateLimit from 'express-rate-limit';

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
