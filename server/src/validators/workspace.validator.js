import { z } from 'zod';

/**
 * Request body validation schema for creating a workspace.
 * Uses strictObject to reject any unexpected fields (e.g. created_by, user_id, role).
 */
export const createWorkspaceSchema = z.strictObject({
  name: z
    .string({ message: 'Workspace name is required' })
    .trim()
    .min(1, 'Workspace name must not be empty')
    .max(120, 'Workspace name must not exceed 120 characters'),
  description: z
    .string({ message: 'Description must be a string' })
    .trim()
    .max(1000, 'Description must not exceed 1000 characters')
    .nullish()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

/**
 * Request body validation schema for adding an existing registered user to a workspace.
 * Uses strictObject to reject any unexpected fields (e.g. role, user_id, workspace_id).
 */
export const addWorkspaceMemberSchema = z.strictObject({
  email: z
    .string({ message: 'Email is required' })
    .trim()
    .email('Invalid email address format')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase(),
});
