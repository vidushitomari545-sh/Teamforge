import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// In-memory test repositories
let mockUsers = [];
let mockWorkspaces = [];
let mockWorkspaceMembers = [];
let membershipFailureError = null;
let listWorkspacesFailureError = null;
let getWorkspaceFailureError = null;
let addMemberFailureError = null;
let bypassDuplicateCheckUserId = null;

const findMockUser = ({ where, select }) => {
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
};

const createTxClient = () => ({
  users: {
    findUnique: vi.fn(async ({ where, select }) => {
      if (addMemberFailureError) {
        throw addMemberFailureError;
      }
      return findMockUser({ where, select });
    }),
  },
  workspaces: {
    findUnique: vi.fn(async ({ where, select }) => {
      if (addMemberFailureError) {
        throw addMemberFailureError;
      }

      const ws = mockWorkspaces.find((w) => w.id === where?.id);
      if (!ws) return null;

      const result = {};
      if (select?.id) result.id = ws.id;
      if (select?.name) result.name = ws.name;
      if (select?.description) result.description = ws.description;
      if (select?.created_by) result.created_by = ws.created_by;
      if (select?.created_at) result.created_at = ws.created_at;
      if (select?.updated_at) result.updated_at = ws.updated_at;
      return result;
    }),
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
    findUnique: vi.fn(async ({ where, select }) => {
      if (addMemberFailureError) {
        throw addMemberFailureError;
      }

      const composite = where?.workspace_id_user_id;
      if (!composite) return null;

      if (bypassDuplicateCheckUserId && composite.user_id === bypassDuplicateCheckUserId) {
        bypassDuplicateCheckUserId = null;
        return null;
      }

      const membership = mockWorkspaceMembers.find(
        (m) => m.workspace_id === composite.workspace_id && m.user_id === composite.user_id
      );

      if (!membership) return null;

      const result = {};
      if (select?.workspace_id) result.workspace_id = membership.workspace_id;
      if (select?.user_id) result.user_id = membership.user_id;
      if (select?.role) result.role = membership.role;
      if (select?.joined_at) result.joined_at = membership.joined_at;
      return result;
    }),
    create: vi.fn(async ({ data, select }) => {
      if (membershipFailureError) {
        throw membershipFailureError;
      }

      // Enforce composite primary key (workspace_id, user_id) like PostgreSQL
      const duplicate = mockWorkspaceMembers.some(
        (m) => m.workspace_id === data.workspace_id && m.user_id === data.user_id
      );
      if (duplicate) {
        const p2002Error = new Error(
          'Unique constraint failed on the fields: (`workspace_id`,`user_id`)'
        );
        p2002Error.code = 'P2002';
        throw p2002Error;
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
      findUnique: vi.fn(async ({ where, select }) => findMockUser({ where, select })),
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
    workspaces: {
      findFirst: vi.fn(async ({ where, select } = {}) => {
        if (getWorkspaceFailureError) {
          throw getWorkspaceFailureError;
        }

        const ws = mockWorkspaces.find((w) => {
          if (where?.id && w.id !== where.id) return false;
          const requiredMemberId = where?.workspace_members?.some?.user_id;
          if (requiredMemberId) {
            const hasMember = mockWorkspaceMembers.some(
              (m) => m.workspace_id === w.id && m.user_id === requiredMemberId
            );
            if (!hasMember) return false;
          }
          return true;
        });

        if (!ws) return null;

        const result = {};
        if (select?.id) result.id = ws.id;
        if (select?.name) result.name = ws.name;
        if (select?.description) result.description = ws.description;
        if (select?.created_by) result.created_by = ws.created_by;
        if (select?.created_at) result.created_at = ws.created_at;
        if (select?.updated_at) result.updated_at = ws.updated_at;

        if (select?.workspace_members) {
          const memberConfig = select.workspace_members;
          let members = mockWorkspaceMembers.filter((m) => m.workspace_id === ws.id);

          if (memberConfig.orderBy?.joined_at === 'asc') {
            members = [...members].sort(
              (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
            );
          }

          result.workspace_members = members.map((m) => {
            const mSelect = memberConfig.select || {};
            const mResult = {};
            if (mSelect.user_id) mResult.user_id = m.user_id;
            if (mSelect.role) mResult.role = m.role;
            if (mSelect.joined_at) mResult.joined_at = m.joined_at;
            if (mSelect.users) {
              const user = mockUsers.find((u) => u.id === m.user_id);
              if (user) {
                const uSelect = mSelect.users.select || {};
                const uResult = {};
                if (uSelect.id) uResult.id = user.id;
                if (uSelect.full_name) uResult.full_name = user.full_name;
                if (uSelect.email) uResult.email = user.email;
                if (uSelect.password_hash) uResult.password_hash = user.password_hash;
                mResult.users = uResult;
              }
            }
            return mResult;
          });
        }

        return result;
      }),
    },
    workspace_members: {
      findMany: vi.fn(async ({ where, orderBy, select } = {}) => {
        if (listWorkspacesFailureError) {
          throw listWorkspacesFailureError;
        }

        let results = mockWorkspaceMembers.filter((m) => {
          if (where?.user_id && m.user_id !== where.user_id) return false;
          return true;
        });

        if (orderBy?.joined_at === 'desc') {
          results = [...results].sort(
            (a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
          );
        }

        return results.map((m) => {
          const item = {};
          if (select?.role) item.role = m.role;
          if (select?.joined_at) item.joined_at = m.joined_at;
          if (select?.workspaces) {
            const ws = mockWorkspaces.find((w) => w.id === m.workspace_id);
            if (ws) {
              const wsSelect = select.workspaces.select || {};
              const wsResult = {};
              if (wsSelect.id) wsResult.id = ws.id;
              if (wsSelect.name) wsResult.name = ws.name;
              if (wsSelect.description) wsResult.description = ws.description;
              if (wsSelect.created_by) wsResult.created_by = ws.created_by;
              if (wsSelect.created_at) wsResult.created_at = ws.created_at;
              if (wsSelect.updated_at) wsResult.updated_at = ws.updated_at;
              item.workspaces = wsResult;
            }
          }
          return item;
        });
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
    listWorkspacesFailureError = null;
    getWorkspaceFailureError = null;
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

describe('GET /api/workspaces', () => {
  const userOne = {
    fullName: 'Alice Builder',
    email: 'alice.list@example.com',
    password: 'StrongPassword123!',
  };

  const userTwo = {
    fullName: 'Bob Collaborator',
    email: 'bob.list@example.com',
    password: 'StrongPassword123!',
  };

  let aliceAgent;
  let aliceUser;
  let bobAgent;
  let bobUser;

  beforeEach(async () => {
    mockUsers = [];
    mockWorkspaces = [];
    mockWorkspaceMembers = [];
    membershipFailureError = null;
    listWorkspacesFailureError = null;
    getWorkspaceFailureError = null;
    vi.clearAllMocks();

    aliceAgent = request.agent(app);
    const aliceReg = await aliceAgent
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(userOne);
    aliceUser = aliceReg.body.data.user;

    bobAgent = request.agent(app);
    const bobReg = await bobAgent
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(userTwo);
    bobUser = bobReg.body.data.user;
  });

  it('should reject unauthenticated requests with 401 Unauthorized', async () => {
    const response = await request(app).get('/api/workspaces');

    expect(response.status).toBe(401);
    expect(response.body.status).toBe('fail');
    expect(response.body.message).toBe('Authentication required. Please log in.');
    expect(prisma.workspace_members.findMany).not.toHaveBeenCalled();
  });

  it('should return an empty array when the authenticated user belongs to no workspaces', async () => {
    const response = await aliceAgent.get('/api/workspaces');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.message).toBe('Workspaces retrieved successfully.');
    expect(response.body.data.workspaces).toEqual([]);
  });

  it('should return workspaces the authenticated user belongs to along with membership roles and metadata', async () => {
    // Alice creates a workspace (role: owner)
    const createdRes = await aliceAgent
      .post('/api/workspaces')
      .set('Origin', 'http://localhost:5173')
      .send({
        name: 'Alice Core Team',
        description: 'Main workspace owned by Alice',
      });
    const ownedWorkspace = createdRes.body.data.workspace;

    // Seed a second workspace owned by Bob where Alice is a member (role: member)
    const sharedWorkspaceId = 'ws-shared-1';
    const sharedCreatedAt = new Date('2026-11-26T15:00:00.000Z');
    const sharedJoinedAt = new Date('2026-11-26T15:10:00.000Z');

    mockWorkspaces.push({
      id: sharedWorkspaceId,
      name: 'Bob Shared Project',
      description: null,
      created_by: bobUser.id,
      created_at: sharedCreatedAt,
      updated_at: sharedCreatedAt,
    });
    mockWorkspaceMembers.push({
      workspace_id: sharedWorkspaceId,
      user_id: aliceUser.id,
      role: 'member',
      joined_at: sharedJoinedAt,
    });

    const response = await aliceAgent.get('/api/workspaces');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');

    const { workspaces } = response.body.data;
    expect(workspaces).toHaveLength(2);

    const ownerEntry = workspaces.find((w) => w.id === ownedWorkspace.id);
    expect(ownerEntry).toMatchObject({
      id: ownedWorkspace.id,
      name: 'Alice Core Team',
      description: 'Main workspace owned by Alice',
      createdBy: aliceUser.id,
      role: 'owner',
    });
    expect(ownerEntry.createdAt).toBeDefined();
    expect(ownerEntry.updatedAt).toBeDefined();
    expect(ownerEntry.joinedAt).toBeDefined();

    const memberEntry = workspaces.find((w) => w.id === sharedWorkspaceId);
    expect(memberEntry).toEqual({
      id: sharedWorkspaceId,
      name: 'Bob Shared Project',
      description: null,
      createdBy: bobUser.id,
      createdAt: sharedCreatedAt.toISOString(),
      updatedAt: sharedCreatedAt.toISOString(),
      role: 'member',
      joinedAt: sharedJoinedAt.toISOString(),
    });
  });

  it('should isolate workspaces per user so one user cannot see another user’s private workspaces', async () => {
    // Alice creates a private workspace
    await aliceAgent
      .post('/api/workspaces')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Alice Secret Workspace' });

    // Bob creates his own workspace
    const bobCreateRes = await bobAgent
      .post('/api/workspaces')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Bob Private Workspace' });

    const bobListRes = await bobAgent.get('/api/workspaces');

    expect(bobListRes.status).toBe(200);
    expect(bobListRes.body.data.workspaces).toHaveLength(1);
    expect(bobListRes.body.data.workspaces[0].id).toBe(bobCreateRes.body.data.workspace.id);
    expect(bobListRes.body.data.workspaces[0].name).toBe('Bob Private Workspace');
    expect(
      bobListRes.body.data.workspaces.some((w) => w.name === 'Alice Secret Workspace')
    ).toBe(false);
  });

  it('should return a sanitized 500 error without leaking internal database details when query fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    listWorkspacesFailureError = new Error(
      'ECONNREFUSED: PostgreSQL relation "workspace_members" failed at pg_pool'
    );

    const response = await aliceAgent.get('/api/workspaces');

    expect(response.status).toBe(500);
    expect(response.body.status).toBe('error');
    expect(response.body.message).toBe('Unable to retrieve workspaces. Please try again later.');
    expect(response.body.message).not.toMatch(/ECONNREFUSED|PostgreSQL|workspace_members|pg_pool/i);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe('GET /api/workspaces/:workspaceId', () => {
  const userOne = {
    fullName: 'Alice Owner',
    email: 'alice.detail@example.com',
    password: 'StrongPassword123!',
  };

  const userTwo = {
    fullName: 'Bob Member',
    email: 'bob.detail@example.com',
    password: 'StrongPassword123!',
  };

  const userThree = {
    fullName: 'Charlie Outsider',
    email: 'charlie.detail@example.com',
    password: 'StrongPassword123!',
  };

  let aliceAgent;
  let aliceUser;
  let bobAgent;
  let bobUser;
  let charlieAgent;
  let workspaceId;

  beforeEach(async () => {
    mockUsers = [];
    mockWorkspaces = [];
    mockWorkspaceMembers = [];
    membershipFailureError = null;
    listWorkspacesFailureError = null;
    getWorkspaceFailureError = null;
    vi.clearAllMocks();

    aliceAgent = request.agent(app);
    const aliceReg = await aliceAgent
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(userOne);
    aliceUser = aliceReg.body.data.user;

    bobAgent = request.agent(app);
    const bobReg = await bobAgent
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(userTwo);
    bobUser = bobReg.body.data.user;

    charlieAgent = request.agent(app);
    await charlieAgent
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(userThree);

    // Alice creates a workspace
    const createRes = await aliceAgent
      .post('/api/workspaces')
      .set('Origin', 'http://localhost:5173')
      .send({
        name: 'Platform Engineering',
        description: 'Core architecture team',
      });
    workspaceId = createRes.body.data.workspace.id;

    // Add Bob as a member of Alice's workspace
    mockWorkspaceMembers.push({
      workspace_id: workspaceId,
      user_id: bobUser.id,
      role: 'member',
      joined_at: new Date('2026-11-28T10:00:00.000Z'),
    });
  });

  it('should reject unauthenticated requests with 401 Unauthorized', async () => {
    const response = await request(app).get(`/api/workspaces/${workspaceId}`);

    expect(response.status).toBe(401);
    expect(response.body.status).toBe('fail');
    expect(response.body.message).toBe('Authentication required. Please log in.');
    expect(prisma.workspaces.findFirst).not.toHaveBeenCalled();
  });

  it('should allow owner access and return workspace details with sanitized member list', async () => {
    const response = await aliceAgent.get(`/api/workspaces/${workspaceId}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.message).toBe('Workspace retrieved successfully.');

    const { workspace } = response.body.data;
    expect(workspace).toMatchObject({
      id: workspaceId,
      name: 'Platform Engineering',
      description: 'Core architecture team',
      createdBy: aliceUser.id,
      role: 'owner',
    });
    expect(workspace.createdAt).toBeDefined();
    expect(workspace.updatedAt).toBeDefined();
    expect(workspace.joinedAt).toBeDefined();

    expect(workspace.members).toHaveLength(2);
    expect(workspace.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: aliceUser.id,
          fullName: 'Alice Owner',
          email: 'alice.detail@example.com',
          role: 'owner',
        }),
        expect.objectContaining({
          userId: bobUser.id,
          fullName: 'Bob Member',
          email: 'bob.detail@example.com',
          role: 'member',
        }),
      ])
    );
    // Password hashes must never be exposed in member objects
    workspace.members.forEach((m) => {
      expect(m.password_hash).toBeUndefined();
      expect(m.password).toBeUndefined();
    });
  });

  it('should allow member access and return workspace details with members', async () => {
    const response = await bobAgent.get(`/api/workspaces/${workspaceId}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');

    const { workspace } = response.body.data;
    expect(workspace.id).toBe(workspaceId);
    expect(workspace.name).toBe('Platform Engineering');
    expect(workspace.role).toBe('member');
    expect(workspace.members).toHaveLength(2);
  });

  it('should return 404 Not Found when authenticated user is not a member of the workspace', async () => {
    const response = await charlieAgent.get(`/api/workspaces/${workspaceId}`);

    expect(response.status).toBe(404);
    expect(response.body.status).toBe('fail');
    expect(response.body.message).toBe('Workspace not found.');
    expect(response.body.data).toBeUndefined();
  });

  it('should return 404 Not Found for a nonexistent workspace or invalid UUID error', async () => {
    const response = await aliceAgent.get(
      '/api/workspaces/00000000-0000-0000-0000-000000000000'
    );

    expect(response.status).toBe(404);
    expect(response.body.status).toBe('fail');
    expect(response.body.message).toBe('Workspace not found.');

    // Simulate PostgreSQL invalid UUID syntax (Prisma P2023)
    const p2023Error = new Error('Inconsistent column data: invalid input syntax for type uuid');
    p2023Error.code = 'P2023';
    getWorkspaceFailureError = p2023Error;

    const invalidUuidResponse = await aliceAgent.get('/api/workspaces/not-a-uuid');

    expect(invalidUuidResponse.status).toBe(404);
    expect(invalidUuidResponse.body.status).toBe('fail');
    expect(invalidUuidResponse.body.message).toBe('Workspace not found.');
  });

  it('should return a sanitized 500 error without leaking internal database details when query fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getWorkspaceFailureError = new Error(
      'ECONNREFUSED: PostgreSQL relation "workspaces" failed at pg_pool'
    );

    const response = await aliceAgent.get(`/api/workspaces/${workspaceId}`);

    expect(response.status).toBe(500);
    expect(response.body.status).toBe('error');
    expect(response.body.message).toBe('Unable to retrieve workspace. Please try again later.');
    expect(response.body.message).not.toMatch(/ECONNREFUSED|PostgreSQL|workspaces|pg_pool/i);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe('POST /api/workspaces/:workspaceId/members', () => {
  const ownerInput = {
    fullName: 'Alice Owner',
    email: 'alice.add@example.com',
    password: 'StrongPassword123!',
  };

  const memberInput = {
    fullName: 'Bob Member',
    email: 'bob.add@example.com',
    password: 'StrongPassword123!',
  };

  const candidateInput = {
    fullName: 'Charlie Candidate',
    email: 'charlie.add@example.com',
    password: 'StrongPassword123!',
  };

  const outsiderInput = {
    fullName: 'Dana Outsider',
    email: 'dana.add@example.com',
    password: 'StrongPassword123!',
  };

  let aliceAgent;
  let bobAgent;
  let bobUser;
  let charlieUser;
  let danaAgent;
  let workspaceId;

  beforeEach(async () => {
    mockUsers = [];
    mockWorkspaces = [];
    mockWorkspaceMembers = [];
    membershipFailureError = null;
    listWorkspacesFailureError = null;
    getWorkspaceFailureError = null;
    addMemberFailureError = null;
    bypassDuplicateCheckUserId = null;
    vi.clearAllMocks();

    aliceAgent = request.agent(app);
    await aliceAgent
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(ownerInput);

    bobAgent = request.agent(app);
    const bobReg = await bobAgent
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(memberInput);
    bobUser = bobReg.body.data.user;

    const charlieReg = await request(app)
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(candidateInput);
    charlieUser = charlieReg.body.data.user;

    danaAgent = request.agent(app);
    await danaAgent
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(outsiderInput);

    const createRes = await aliceAgent
      .post('/api/workspaces')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'TeamForge Core' });
    workspaceId = createRes.body.data.workspace.id;

    // Seed Bob as an existing 'member' (not owner) in Alice's workspace
    mockWorkspaceMembers.push({
      workspace_id: workspaceId,
      user_id: bobUser.id,
      role: 'member',
      joined_at: new Date('2026-11-28T10:00:00.000Z'),
    });

    vi.clearAllMocks();
  });

  describe('Authentication & CSRF', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: charlieUser.email });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Authentication required. Please log in.');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject requests from untrusted origins with 403 Forbidden', async () => {
      const response = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'https://untrusted.example')
        .send({ email: charlieUser.email });

      expect(response.status).toBe(403);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/CSRF verification failed/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Request validation', () => {
    it('should reject missing or invalid email with 400 Bad Request', async () => {
      const missingRes = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({});

      expect(missingRes.status).toBe(400);
      expect(missingRes.body.status).toBe('fail');
      expect(missingRes.body.errors).toHaveProperty('email');

      const invalidRes = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: 'not-an-email' });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.errors).toHaveProperty('email');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject unexpected client fields such as role, user_id, or workspace_id', async () => {
      const withRole = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: charlieUser.email, role: 'owner' });

      expect(withRole.status).toBe(400);
      expect(withRole.body.status).toBe('fail');
      expect(withRole.body.message).toMatch(/Unrecognized key/i);

      const withUserId = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: charlieUser.email, user_id: charlieUser.id, workspace_id: workspaceId });

      expect(withUserId.status).toBe(400);
      expect(withUserId.body.message).toMatch(/Unrecognized key/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Authorization & business rules', () => {
    it('should allow workspace owner to add an existing registered user with normalized email and member role', async () => {
      const response = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: '  CHARLIE.ADD@EXAMPLE.COM  ' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Workspace member added successfully.');

      const { member } = response.body.data;
      expect(member).toMatchObject({
        workspaceId,
        userId: charlieUser.id,
        fullName: 'Charlie Candidate',
        email: 'charlie.add@example.com',
        role: 'member',
      });
      expect(member.joinedAt).toBeDefined();
      expect(member.password_hash).toBeUndefined();
      expect(member.password).toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockWorkspaceMembers).toHaveLength(3);
      expect(
        mockWorkspaceMembers.find((m) => m.user_id === charlieUser.id)?.role
      ).toBe('member');
    });

    it('should forbid a workspace member without owner role from adding another user (403)', async () => {
      const response = await bobAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: charlieUser.email });

      expect(response.status).toBe(403);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Only workspace owners can add members.');
      expect(mockWorkspaceMembers).toHaveLength(2);
    });

    it('should reject a non-member trying to add a user with 404 Not Found', async () => {
      const response = await danaAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: charlieUser.email });

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Workspace not found.');
      expect(mockWorkspaceMembers).toHaveLength(2);
    });

    it('should return 404 Not Found for an unknown workspace or invalid UUID', async () => {
      const response = await aliceAgent
        .post('/api/workspaces/00000000-0000-0000-0000-000000000000/members')
        .set('Origin', 'http://localhost:5173')
        .send({ email: charlieUser.email });

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Workspace not found.');

      const p2023Error = new Error('Invalid UUID syntax');
      p2023Error.code = 'P2023';
      addMemberFailureError = p2023Error;

      const invalidIdRes = await aliceAgent
        .post('/api/workspaces/not-a-uuid/members')
        .set('Origin', 'http://localhost:5173')
        .send({ email: charlieUser.email });

      expect(invalidIdRes.status).toBe(404);
      expect(invalidIdRes.body.message).toBe('Workspace not found.');
    });

    it('should return 404 Not Found when target user email is not registered', async () => {
      const response = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: 'missing@example.com' });

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('User with this email was not found.');
      expect(mockWorkspaceMembers).toHaveLength(2);
    });

    it('should return 409 Conflict for duplicate membership (both pre-check and DB P2002 race)', async () => {
      // Case 1: Caught by application-level lookup inside transaction
      const precheckRes = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: memberInput.email });

      expect(precheckRes.status).toBe(409);
      expect(precheckRes.body.status).toBe('fail');
      expect(precheckRes.body.message).toBe('User is already a member of this workspace.');
      expect(mockWorkspaceMembers).toHaveLength(2);

      // Case 2: Concurrent race reaching composite PK (workspace_id, user_id) -> Prisma P2002
      bypassDuplicateCheckUserId = bobUser.id;
      const raceRes = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: memberInput.email });

      expect(raceRes.status).toBe(409);
      expect(raceRes.body.status).toBe('fail');
      expect(raceRes.body.message).toBe('User is already a member of this workspace.');
      expect(mockWorkspaceMembers).toHaveLength(2);
    });

    it('should return a sanitized 500 error without leaking internal database details on unexpected failure', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      addMemberFailureError = new Error(
        'ECONNREFUSED: PostgreSQL relation "workspace_members" constraint failure'
      );

      const response = await aliceAgent
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: charlieUser.email });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Unable to add workspace member. Please try again later.');
      expect(response.body.message).not.toMatch(/ECONNREFUSED|PostgreSQL|workspace_members/i);
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });
});
