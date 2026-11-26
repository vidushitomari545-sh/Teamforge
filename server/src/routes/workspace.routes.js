import { Router } from 'express';
import { createWorkspace, listMyWorkspaces } from '../controllers/workspace.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { csrfProtection } from '../middleware/csrfProtection.js';
import { validate } from '../middleware/validate.js';
import { createWorkspaceSchema } from '../validators/workspace.validator.js';

const router = Router();

// List workspaces for the authenticated user (Read-only, Authenticated)
router.get('/', requireAuth, listMyWorkspaces);

// Create a new workspace (Authenticated + CSRF protected)
router.post('/', csrfProtection, requireAuth, validate(createWorkspaceSchema), createWorkspace);

export default router;
