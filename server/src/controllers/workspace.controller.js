import { prisma } from '../config/prisma.js';

/**
 * Create a new workspace and assign the authenticated creator as owner
 * within a single database transaction.
 * POST /api/workspaces
 */
export const createWorkspace = async (req, res, next) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  try {
    const { workspace, membership } = await prisma.$transaction(async (tx) => {
      const createdWorkspace = await tx.workspaces.create({
        data: {
          name,
          description,
          created_by: userId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          created_by: true,
          created_at: true,
          updated_at: true,
        },
      });

      const createdMembership = await tx.workspace_members.create({
        data: {
          workspace_id: createdWorkspace.id,
          user_id: userId,
          role: 'owner',
        },
        select: {
          workspace_id: true,
          user_id: true,
          role: true,
          joined_at: true,
        },
      });

      return {
        workspace: createdWorkspace,
        membership: createdMembership,
      };
    });

    return res.status(201).json({
      status: 'success',
      message: 'Workspace created successfully.',
      data: {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          createdBy: workspace.created_by,
          createdAt: workspace.created_at,
          updatedAt: workspace.updated_at,
        },
        membership: {
          workspaceId: membership.workspace_id,
          userId: membership.user_id,
          role: membership.role,
          joinedAt: membership.joined_at,
        },
      },
    });
  } catch (error) {
    console.error('[Workspace Controller Error] Failed to create workspace:', error);

    // Forward sanitized error to centralized errorHandler so internal Prisma/PostgreSQL details never leak
    const safeError = new Error('Unable to create workspace. Please try again later.');
    safeError.statusCode = 500;
    return next(safeError);
  }
};
