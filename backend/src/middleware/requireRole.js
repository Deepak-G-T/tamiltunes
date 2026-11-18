/** After requireAuth: only accounts with one of these roles (users.role, set by hand in the database) may continue. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication token required' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Not allowed' });
  return next();
};
