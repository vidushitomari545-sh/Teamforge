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

/**
 * List all workspaces the authenticated user belongs to.
 * GET /api/workspaces
 */
export const listMyWorkspaces = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const memberships = await prisma.workspace_members.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        joined_at: 'desc',
      },
      select: {
        role: true,
        joined_at: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            description: true,
            created_by: true,
            created_at: true,
            updated_at: true,
          },
        },
      },
    });

    const workspaces = memberships.map((membership) => ({
      id: membership.workspaces.id,
      name: membership.workspaces.name,
      description: membership.workspaces.description,
      createdBy: membership.workspaces.created_by,
      createdAt: membership.workspaces.created_at,
      updatedAt: membership.workspaces.updated_at,
      role: membership.role,
      joinedAt: membership.joined_at,
    }));

    return res.status(200).json({
      status: 'success',
      message: 'Workspaces retrieved successfully.',
      data: {
        workspaces,
      },
    });
  } catch (error) {
    console.error('[Workspace Controller Error] Failed to list workspaces:', error);

    const safeError = new Error('Unable to retrieve workspaces. Please try again later.');
    safeError.statusCode = 500;
    return next(safeError);
  }
};
