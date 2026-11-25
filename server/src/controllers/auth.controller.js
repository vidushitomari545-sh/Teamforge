import { prisma } from '../config/prisma.js';
import { hashPassword, comparePassword, DUMMY_HASH } from '../utils/password.js';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '../config/session.js';

/**
 * Register a new user account.
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  const { fullName, email, password } = req.body;

  try {
    // 1. Check if email already exists
    const existingUser = await prisma.users.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({
        status: 'fail',
        message: 'An account with this email already exists.',
      });
    }

    // 2. Hash password with bcryptjs (work factor = 12)
    const passwordHash = await hashPassword(password);

    // 3. Persist new user in PostgreSQL
    const newUser = await prisma.users.create({
      data: {
        full_name: fullName,
        email,
        password_hash: passwordHash,
      },
      select: {
        id: true,
        full_name: true,
        email: true,
        created_at: true,
      },
    });

    // 4. Regenerate session to prevent session fixation and establish session
    req.session.regenerate((err) => {
      if (err) {
        return next(err);
      }

      req.session.userId = newUser.id;

      req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr);
        }

        res.status(201).json({
          status: 'success',
          message: 'User registered successfully.',
          data: {
            user: {
              id: newUser.id,
              fullName: newUser.full_name,
              email: newUser.email,
              createdAt: newUser.created_at,
            },
          },
        });
      });
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Authenticate existing user credentials and establish session.
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    // 1. Find user by email
    const user = await prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        full_name: true,
        email: true,
        password_hash: true,
        created_at: true,
      },
    });

    // Timing-safe response: always run a bcrypt comparison regardless of whether the
    // email was found. Without this, an attacker measuring response time could determine
    // whether an account exists (fast reject ≈ no user; slow reject ≈ wrong password).
    if (!user) {
      await comparePassword(password, DUMMY_HASH);
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password.',
      });
    }

    // 2. Verify password with bcryptjs
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password.',
      });
    }

    // 3. Regenerate session ID before assigning user ID (prevents session fixation)
    req.session.regenerate((err) => {
      if (err) {
        return next(err);
      }

      req.session.userId = user.id;

      req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr);
        }

        res.status(200).json({
          status: 'success',
          message: 'Login successful.',
          data: {
            user: {
              id: user.id,
              fullName: user.full_name,
              email: user.email,
              createdAt: user.created_at,
            },
          },
        });
      });
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve authenticated user profile.
 * GET /api/auth/me
 */
export const getMe = (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
};

/**
 * Terminate user session and clear session cookie.
 * POST /api/auth/logout
 */
export const logout = (req, res, next) => {
  if (!req.session) {
    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully.',
    });
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth Controller Error] Error destroying session:', err);
      return next(err);
    }

    res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);
    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully.',
    });
  });
};
