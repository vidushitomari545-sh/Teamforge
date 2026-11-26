import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// In-memory test repositories
let mockUsers = [];
let mockWorkspaces = [];
let mockWorkspaceMembers = [];
let membershipFailureError = null;

const createTxClient = () => ({
  workspaces: {
    create: vi.fn(async ({ data, select }) => {
      const now = new Date('2026-11-26T14:30:00.000Z');
      const newWorkspace = {
        id: 'ws-' + Math.random().toString(36).substring(2, 9),
        name: data.name,
        description: data.description ?? null,
        created_by: data.created_by,
        created_at: now,
        updated_at: now,
      };
      mockWorkspaces.push(newWorkspace);

      const result = {};
      if (select?.id) result.id = newWorkspace.id;
      if (select?.name) result.name = newWorkspace.name;
      if (select?.description) result.description = newWorkspace.description;
      if (select?.created_by) result.created_by = newWorkspace.created_by;
      if (select?.created_at) result.created_at = newWorkspace.created_at;
      if (select?.updated_at) result.updated_at = newWorkspace.updated_at;
      return result;
    }),
  },
  workspace_members: {
    create: vi.fn(async ({ data, select }) => {
      if (membershipFailureError) {
        throw membershipFailureError;
      }

      const newMembership = {
        workspace_id: data.workspace_id,
        user_id: data.user_id,
        role: data.role,
        joined_at: new Date('2026-11-26T14:30:00.000Z'),
      };
      mockWorkspaceMembers.push(newMembership);

      const result = {};
      if (select?.workspace_id) result.workspace_id = newMembership.workspace_id;
      if (select?.user_id) result.user_id = newMembership.user_id;
      if (select?.role) result.role = newMembership.role;
      if (select?.joined_at) result.joined_at = newMembership.joined_at;
      return result;
    }),
  },
});

vi.mock('../src/config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    users: {
      findUnique: vi.fn(async ({ where, select }) => {
        const user = mockUsers.find((u) => {
          if (where.email && u.email.toLowerCase() === where.email.toLowerCase()) return true;
          if (where.id && u.id === where.id) return true;
          return false;
        });

        if (!user) return null;

        const result = {};
        if (select?.id) result.id = user.id;
        if (select?.full_name) result.full_name = user.full_name;
        if (select?.email) result.email = user.email;
        if (select?.password_hash) result.password_hash = user.password_hash;
        if (select?.created_at) result.created_at = user.created_at;
        return result;
      }),
      create: vi.fn(async ({ data, select }) => {
        const newUser = {
          id: 'user-' + Math.random().toString(36).substring(2, 9),
          full_name: data.full_name,
          email: data.email,
          password_hash: data.password_hash,
          created_at: new Date('2026-11-26T14:00:00.000Z'),
        };
        mockUsers.push(newUser);

        const result = {};
        if (select?.id) result.id = newUser.id;
        if (select?.full_name) result.full_name = newUser.full_name;
        if (select?.email) result.email = newUser.email;
        if (select?.created_at) result.created_at = newUser.created_at;
        return result;
      }),
    },
    $transaction: vi.fn(async (callback) => {
      // Snapshot state to simulate database rollback if transaction fails
      const workspacesSnapshot = [...mockWorkspaces];
      const membersSnapshot = [...mockWorkspaceMembers];

      try {
        const tx = createTxClient();
        return await callback(tx);
      } catch (err) {
        mockWorkspaces = workspacesSnapshot;
        mockWorkspaceMembers = membersSnapshot;
        throw err;
      }
    }),
  },
}));

import { prisma } from '../src/config/prisma.js';
import app from '../src/app.js';

describe('POST /api/workspaces', () => {
  const validUser = {
    fullName: 'Alice Builder',
    email: 'alice@example.com',
    password: 'StrongPassword123!',
  };

  let authenticatedAgent;
  let authenticatedUser;

  beforeEach(async () => {
    mockUsers = [];
    mockWorkspaces = [];
    mockWorkspaceMembers = [];
    membershipFailureError = null;
    vi.clearAllMocks();

    authenticatedAgent = request.agent(app);
    const regResponse = await authenticatedAgent
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(validUser);

    authenticatedUser = regResponse.body.data.user;
  });

  describe('Authentication & CSRF', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Engineering' });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Authentication required. Please log in.');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mockWorkspaces).toHaveLength(0);
    });

    it('should reject requests from untrusted origins with 403 Forbidden', async () => {
      const response = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'https://evil-site.example')
        .send({ name: 'Engineering' });

      expect(response.status).toBe(403);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/CSRF verification failed/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Request validation', () => {
    it('should reject missing workspace name with 400 Bad Request', async () => {
      const response = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/Workspace name is required/i);
      expect(response.body.errors).toHaveProperty('name');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject whitespace-only workspace name with 400 Bad Request', async () => {
      const response = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({ name: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(response.body.errors).toHaveProperty('name');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject workspace name exceeding 120 characters with 400 Bad Request', async () => {
      const response = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'A'.repeat(121) });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(response.body.errors).toHaveProperty('name');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject non-string description or description exceeding 1000 characters', async () => {
      const invalidTypeRes = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Valid Team', description: 12345 });

      expect(invalidTypeRes.status).toBe(400);
      expect(invalidTypeRes.body.errors).toHaveProperty('description');

      const tooLongRes = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Valid Team', description: 'D'.repeat(1001) });

      expect(tooLongRes.status).toBe(400);
      expect(tooLongRes.body.errors).toHaveProperty('description');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject unexpected client fields such as created_by, user_id, or role', async () => {
      const response = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Engineering',
          created_by: 'spoofed-user-id',
          user_id: 'spoofed-user-id',
          role: 'admin',
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/Unrecognized key/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Successful workspace creation', () => {
    it('should create workspace and owner membership atomically and return 201 Created', async () => {
      const response = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: '  Product Engineering  ',
          description: '  Core platform delivery team  ',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Workspace created successfully.');

      const { workspace, membership } = response.body.data;
      expect(workspace).toBeDefined();
      expect(workspace.id).toBeDefined();
      expect(workspace.name).toBe('Product Engineering');
      expect(workspace.description).toBe('Core platform delivery team');
      expect(workspace.createdBy).toBe(authenticatedUser.id);
      expect(workspace.createdAt).toBeDefined();
      expect(workspace.updatedAt).toBeDefined();

      expect(membership).toBeDefined();
      expect(membership.workspaceId).toBe(workspace.id);
      expect(membership.userId).toBe(authenticatedUser.id);
      expect(membership.role).toBe('owner');
      expect(membership.joinedAt).toBeDefined();

      // Verify both database writes occurred inside a single transaction
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockWorkspaces).toHaveLength(1);
      expect(mockWorkspaces[0].created_by).toBe(authenticatedUser.id);
      expect(mockWorkspaceMembers).toHaveLength(1);
      expect(mockWorkspaceMembers[0]).toMatchObject({
        workspace_id: workspace.id,
        user_id: authenticatedUser.id,
        role: 'owner',
      });
    });

    it('should allow optional description to be omitted or empty and store null', async () => {
      const omittedResponse = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Design Team' });

      expect(omittedResponse.status).toBe(201);
      expect(omittedResponse.body.data.workspace.description).toBeNull();

      const emptyDescResponse = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'QA Team', description: '   ' });

      expect(emptyDescResponse.status).toBe(201);
      expect(emptyDescResponse.body.data.workspace.description).toBeNull();
      expect(mockWorkspaces).toHaveLength(2);
      expect(mockWorkspaceMembers).toHaveLength(2);
    });
  });

  describe('Transaction failure and error handling', () => {
    it('should roll back workspace creation and return sanitized 500 error when membership creation fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      membershipFailureError = new Error(
        'PostgreSQL deadlock detected on relation "workspace_members" in schema "public"'
      );

      const response = await authenticatedAgent
        .post('/api/workspaces')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Rollback Team', description: 'Should not persist' });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Unable to create workspace. Please try again later.');
      // Ensure internal DB error details are never leaked in response message
      expect(response.body.message).not.toMatch(/PostgreSQL|deadlock|workspace_members/i);

      // Verify transaction rolled back completely
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockWorkspaces).toHaveLength(0);
      expect(mockWorkspaceMembers).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });
});
