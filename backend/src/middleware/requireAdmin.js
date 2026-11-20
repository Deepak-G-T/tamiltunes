import { db } from '../prisma/client.js';
import { requireAuth } from './auth.js';
import { config, isAdminEmail } from '../config/env.js';

/**
 * Re-check admin role and active status directly from DB.
 * Never trust stale JWT claims or client-provided fields.
 */
export const requireAdmin = [
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const freshUser = await db.user.findUnique({
        where: { id: req.user.id }
      });

      if (!freshUser) {
        return res.status(401).json({ message: 'User not found' });
      }

      if (freshUser.isActive === false) {
        return res.status(403).json({ message: 'Account is deactivated' });
      }

      if (freshUser.role !== 'admin') {
        return res.status(403).json({ message: 'Admin privileges required' });
      }

      // Google-only: the admin is the Google account(s) listed in ADMIN_EMAILS (a Render setting, not in the repository). A database role alone is not enough.
      if (config.adminEmailsEnforced && !isAdminEmail(freshUser.email)) {
        return res.status(403).json({ message: 'Admin privileges required' });
      }

      req.user = freshUser;
      next();
    } catch (err) {
      next(err);
    }
  }
];

/**
 * Record an entry into the audit_logs table.
 */
export async function recordAuditLog({ actorId, actorEmail, action, targetType, targetId, details = {}, ip }) {
  try {
    return await db.auditLog.create({
      data: {
        actorId: actorId || null,
        actorEmail: actorEmail || null,
        action,
        targetType: targetType || null,
        targetId: targetId ? String(targetId) : null,
        details: typeof details === 'object' ? details : {},
        ip: ip || null
      }
    });
  } catch (err) {
    console.error('Failed to record audit log:', err.message);
    return null;
  }
}
