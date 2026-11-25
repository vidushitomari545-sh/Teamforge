import { prisma } from '../config/prisma.js';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '../config/session.js';

/**
 * Authentication middleware that verifies an active user session
 * and safely loads user profile data (excluding password_hash).
 */
export const requireAuth = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      status: 'fail',
      message: 'Authentication required. Please log in.',
    });
  }

  try {
    const user = await prisma.users.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        full_name: true,
        email: true,
        created_at: true,
      },
    });

    if (!user) {
      // Session references a deleted or nonexistent user; destroy the server-side session
      // and clear the browser cookie so the client does not keep sending a stale credential.
      req.session.destroy(() => {});
      res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);
      return res.status(401).json({
        status: 'fail',
        message: 'User account not found. Please log in again.',
      });
    }

    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      createdAt: user.created_at,
    };

    next();
  } catch (error) {
    console.error('[Auth Middleware Error] Failed to load session user:', error);
    next(error);
  }
};
