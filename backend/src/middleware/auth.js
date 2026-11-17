import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { db } from '../prisma/client.js';

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

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username ?? null,
      role: user.role || 'user'
    };

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
      if (user) {
        req.user = { id: user.id, email: user.email, name: user.name, username: user.username ?? null, role: user.role || 'user' };
      }
    }
  } catch (err) {
    // Ignore error for optional auth
  }
  next();
};
