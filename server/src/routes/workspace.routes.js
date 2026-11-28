import { Router } from 'express';
import {
  createWorkspace,
  listMyWorkspaces,
  getWorkspaceById,
} from '../controllers/workspace.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { csrfProtection } from '../middleware/csrfProtection.js';
import { validate } from '../middleware/validate.js';
import { createWorkspaceSchema } from '../validators/workspace.validator.js';

const router = Router();

// List workspaces for the authenticated user (Read-only, Authenticated)
router.get('/', requireAuth, listMyWorkspaces);

// Retrieve a single workspace with its members (Read-only, Authenticated member only)
router.get('/:workspaceId', requireAuth, getWorkspaceById);

// Create a new workspace (Authenticated + CSRF protected)
router.post('/', csrfProtection, requireAuth, validate(createWorkspaceSchema), createWorkspace);

export default router;
