import { ZodError } from 'zod';

export const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues || err.errors || [];
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: issues.map((e) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : '',
          message: e.message
        }))
      });
    }
    next(err);
  }
};
