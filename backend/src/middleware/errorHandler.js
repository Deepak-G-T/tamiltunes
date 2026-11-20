import { reportError } from '../monitoring.js';

export const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.statusCode || err.status || (err.name === 'ZodError' ? 400 : 500);

  if (statusCode >= 500) {
    // route PATTERN (/songs/:id/related), never the real URL: it can hold ids and search words
    reportError(err, { method: req.method, route: `${req.baseUrl || ''}${req.route?.path || ''}` || 'unknown', status: String(statusCode) });
  }

  if (!isProduction) {
    if (statusCode >= 500) {
      console.error('Unhandled Application Error:', err);
    }
  } else {
    console.error(`[Error] ${req.method} ${req.url} - ${err.message}`);
  }

  // In production, mask 500 errors to avoid leaking database connection strings or internals
  const message = isProduction && statusCode >= 500
    ? 'Internal Server Error. Please try again later.'
    : err.message || 'An unexpected error occurred';

  res.status(statusCode).json({
    success: false,
    message,
    ...(!isProduction && { stack: err.stack })
  });
};
