/**
 * Fail-closed gate for admin routes that are NOT yet behind the admin panel's own check (PR #31: admin role, two-factor login, password re-entry).
 * After requireAuth. Everybody gets 403 unless BOTH are true:
 *   1. the account's role in the database is "admin" (read on every request, never from the token), and
 *   2. its user id is in the server setting named by `envName` (comma-separated ids, set by the owner on Render).
 * With the setting empty or missing, nobody passes (403 for everyone, admins included). Read on each request, so a change takes effect at once.
 * When PR #31 is merged, replace this with #31's admin middleware.
 */
export const ownerAdminIds = (envName, env = process.env) =>
  new Set(String(env[envName] || '').split(',').map((s) => s.trim()).filter(Boolean));

export const requireOwnerAdmin = (envName, env = process.env) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication token required' });
  if (req.user.role !== 'admin' || !ownerAdminIds(envName, env).has(req.user.id)) {
    return res.status(403).json({ success: false, message: 'Not allowed' });
  }
  return next();
};
