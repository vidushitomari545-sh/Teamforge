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

/**
 * Retrieve a single workspace and its members if the authenticated user is a member.
 * Returns 404 for both nonexistent workspaces and non-members to prevent workspace ID enumeration.
 * GET /api/workspaces/:workspaceId
 */
export const getWorkspaceById = async (req, res, next) => {
  const { workspaceId } = req.params;
  const userId = req.user.id;

  try {
    const workspace = await prisma.workspaces.findFirst({
      where: {
        id: workspaceId,
        workspace_members: {
          some: {
            user_id: userId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        created_by: true,
        created_at: true,
        updated_at: true,
        workspace_members: {
          orderBy: {
            joined_at: 'asc',
          },
          select: {
            user_id: true,
            role: true,
            joined_at: true,
            users: {
              select: {
                id: true,
                full_name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!workspace) {
      return res.status(404).json({
        status: 'fail',
        message: 'Workspace not found.',
      });
    }

    const currentMembership = workspace.workspace_members.find(
      (member) => member.user_id === userId
    );

    const members = workspace.workspace_members.map((member) => ({
      userId: member.user_id,
      fullName: member.users.full_name,
      email: member.users.email,
      role: member.role,
      joinedAt: member.joined_at,
    }));

    return res.status(200).json({
      status: 'success',
      message: 'Workspace retrieved successfully.',
      data: {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          createdBy: workspace.created_by,
          createdAt: workspace.created_at,
          updatedAt: workspace.updated_at,
          role: currentMembership?.role,
          joinedAt: currentMembership?.joined_at,
          members,
        },
      },
    });
  } catch (error) {
    // PostgreSQL invalid UUID syntax surfaces as Prisma P2023; treat as not found
    if (error?.code === 'P2023') {
      return res.status(404).json({
        status: 'fail',
        message: 'Workspace not found.',
      });
    }

    console.error('[Workspace Controller Error] Failed to retrieve workspace:', error);

    const safeError = new Error('Unable to retrieve workspace. Please try again later.');
    safeError.statusCode = 500;
    return next(safeError);
  }
};
