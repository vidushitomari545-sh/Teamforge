import { Router } from 'express';
import { register, login, logout, getMe } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { csrfProtection } from '../middleware/csrfProtection.js';

const router = Router();

// Registration
router.post('/register', csrfProtection, validate(registerSchema), register);

// Login
router.post('/login', csrfProtection, validate(loginSchema), login);

// Logout
router.post('/logout', csrfProtection, logout);

// Current user profile (Protected)
router.get('/me', requireAuth, getMe);

export default router;
