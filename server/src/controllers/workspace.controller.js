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

const createClientError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

/**
 * Add an existing registered user to a workspace with the 'member' role.
 * Restricted exclusively to users holding the 'owner' role in that workspace.
 * POST /api/workspaces/:workspaceId/members
 */
export const addWorkspaceMember = async (req, res, next) => {
  const { workspaceId } = req.params;
  const { email } = req.body;
  const requesterId = req.user.id;

  try {
    const { member, targetUser } = await prisma.$transaction(async (tx) => {
      // 1. Verify workspace exists
      const workspace = await tx.workspaces.findUnique({
        where: { id: workspaceId },
        select: { id: true },
      });

      if (!workspace) {
        throw createClientError(404, 'Workspace not found.');
      }

      // 2. Verify requester membership & owner role (non-members get 404 to prevent ID enumeration)
      const requesterMembership = await tx.workspace_members.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: workspaceId,
            user_id: requesterId,
          },
        },
        select: { role: true },
      });

      if (!requesterMembership) {
        throw createClientError(404, 'Workspace not found.');
      }

      if (requesterMembership.role !== 'owner') {
        throw createClientError(403, 'Only workspace owners can add members.');
      }

      // 3. Look up target registered user by normalized email
      const foundUser = await tx.users.findUnique({
        where: { email },
        select: {
          id: true,
          full_name: true,
          email: true,
        },
      });

      if (!foundUser) {
        throw createClientError(404, 'User with this email was not found.');
      }

      // 4. Reject duplicate membership cleanly before insert (DB composite PK also guards races)
      const existingMembership = await tx.workspace_members.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: workspaceId,
            user_id: foundUser.id,
          },
        },
        select: { user_id: true },
      });

      if (existingMembership) {
        throw createClientError(409, 'User is already a member of this workspace.');
      }

      // 5. Persist membership with hardcoded 'member' role
      const createdMembership = await tx.workspace_members.create({
        data: {
          workspace_id: workspaceId,
          user_id: foundUser.id,
          role: 'member',
        },
        select: {
          workspace_id: true,
          user_id: true,
          role: true,
          joined_at: true,
        },
      });

      return {
        member: createdMembership,
        targetUser: foundUser,
      };
    });

    return res.status(201).json({
      status: 'success',
      message: 'Workspace member added successfully.',
      data: {
        member: {
          workspaceId: member.workspace_id,
          userId: member.user_id,
          fullName: targetUser.full_name,
          email: targetUser.email,
          role: member.role,
          joinedAt: member.joined_at,
        },
      },
    });
  } catch (error) {
    if (error?.isOperational) {
      return res.status(error.statusCode).json({
        status: 'fail',
        message: error.message,
      });
    }

    // Handle database-level composite PK duplicate race (workspace_id, user_id)
    if (error?.code === 'P2002') {
      return res.status(409).json({
        status: 'fail',
        message: 'User is already a member of this workspace.',
      });
    }

    // PostgreSQL invalid UUID syntax surfaces as Prisma P2023; treat as not found
    if (error?.code === 'P2023') {
      return res.status(404).json({
        status: 'fail',
        message: 'Workspace not found.',
      });
    }

    console.error('[Workspace Controller Error] Failed to add workspace member:', error);

    const safeError = new Error('Unable to add workspace member. Please try again later.');
    safeError.statusCode = 500;
    return next(safeError);
  }
};
