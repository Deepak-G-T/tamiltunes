export const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    console.error('Unhandled Application Error:', err);
  } else {
    console.error(`[Error] ${req.method} ${req.url} - ${err.message}`);
  }

  const statusCode = err.statusCode || (err.name === 'ZodError' ? 400 : 500);

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
