import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// In-memory test repository for users
let mockUsers = [];

// Controls whether requireAuth's user lookup returns null (simulates deleted user)
let simulateDeletedUser = false;

vi.mock('../src/config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    users: {
      findUnique: vi.fn(async ({ where, select }) => {
        // Allow tests to simulate a user that was deleted after session creation
        if (where.id && simulateDeletedUser) return null;

        const user = mockUsers.find((u) => {
          if (where.email && u.email.toLowerCase() === where.email.toLowerCase()) return true;
          if (where.id && u.id === where.id) return true;
          return false;
        });

        if (!user) return null;

        // Return only selected fields
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
          created_at: new Date('2026-11-25T12:00:00.000Z'),
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
  },
}));

import app from '../src/app.js';

describe('Authentication & Session Management API', () => {
  beforeEach(() => {
    mockUsers = [];
    simulateDeletedUser = false;
    vi.clearAllMocks();
  });

  const validRegistration = {
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    password: 'SecurePassword123!',
  };

  describe('POST /api/auth/register', () => {
    it('should register a new user, return 201 Created, and set session cookie', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(validRegistration);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('User registered successfully.');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.fullName).toBe('Jane Doe');
      expect(response.body.data.user.email).toBe('jane.doe@example.com');
      expect(response.body.data.user.id).toBeDefined();
      expect(response.body.data.user.createdAt).toBeDefined();
      // Crucial: password_hash must NEVER be exposed
      expect(response.body.data.user.password_hash).toBeUndefined();
      expect(response.body.data.user.password).toBeUndefined();

      // Session cookie must be issued
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = cookies.find((c) => c.startsWith('teamforge.sid='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toMatch(/HttpOnly/i);
      expect(sessionCookie).toMatch(/SameSite=Lax/i);
    });

    it('should reject registration with 400 Bad Request on invalid input', async () => {
      const invalidData = {
        fullName: '',
        email: 'not-an-email',
        password: 'short',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/Validation error/i);
      expect(response.body.errors).toHaveProperty('fullName');
      expect(response.body.errors).toHaveProperty('email');
      expect(response.body.errors).toHaveProperty('password');
    });

    it('should reject duplicate email registration with 409 Conflict', async () => {
      // Register first user
      await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(validRegistration);

      // Attempt second registration with same email
      const duplicateResponse = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(validRegistration);

      expect(duplicateResponse.status).toBe(409);
      expect(duplicateResponse.body.status).toBe('fail');
      expect(duplicateResponse.body.message).toBe('An account with this email already exists.');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Seed registered user
      await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(validRegistration);
    });

    it('should log in successfully with valid credentials, return 200, and regenerate session', async () => {
      const loginPayload = {
        email: 'jane.doe@example.com',
        password: 'SecurePassword123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send(loginPayload);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Login successful.');
      expect(response.body.data.user.email).toBe('jane.doe@example.com');
      expect(response.body.data.user.password_hash).toBeUndefined();

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = cookies.find((c) => c.startsWith('teamforge.sid='));
      expect(sessionCookie).toBeDefined();
    });

    it('should reject login with 401 Unauthorized on incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: 'jane.doe@example.com',
          password: 'WrongPassword!',
        });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Invalid email or password.');
    });

    it('should reject login with 401 Unauthorized on non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Invalid email or password.');
    });
  });

  describe('GET /api/auth/me (Protected)', () => {
    it('should return 401 Unauthorized when not logged in', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('Authentication required. Please log in.');
    });

    it('should return 200 OK and user profile when authenticated with active session', async () => {
      const agent = request.agent(app);

      // Register and establish session on agent
      await agent
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(validRegistration);

      // Request profile with session cookie automatically maintained by agent
      const meResponse = await agent.get('/api/auth/me');

      expect(meResponse.status).toBe(200);
      expect(meResponse.body.status).toBe('success');
      expect(meResponse.body.data.user).toBeDefined();
      expect(meResponse.body.data.user.email).toBe('jane.doe@example.com');
      expect(meResponse.body.data.user.fullName).toBe('Jane Doe');
      expect(meResponse.body.data.user.password_hash).toBeUndefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should destroy session and clear session cookie on logout', async () => {
      const agent = request.agent(app);

      // 1. Log in
      await agent
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(validRegistration);

      // 2. Log out
      const logoutResponse = await agent
        .post('/api/auth/logout')
        .set('Origin', 'http://localhost:5173');

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.status).toBe('success');
      expect(logoutResponse.body.message).toBe('Logged out successfully.');

      // Check cookie cleared
      const cookies = logoutResponse.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const clearedCookie = cookies.find((c) => c.startsWith('teamforge.sid='));
      expect(clearedCookie).toBeDefined();

      // 3. Subsequent /me request should be rejected with 401
      const meAfterLogout = await agent.get('/api/auth/me');
      expect(meAfterLogout.status).toBe(401);
    });
  });

  describe('CSRF & Origin Protection', () => {
    it('should reject state-changing requests from untrusted origins with 403 Forbidden', async () => {
      const maliciousResponse = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://malicious-website.com')
        .send(validRegistration);

      expect(maliciousResponse.status).toBe(403);
      expect(maliciousResponse.body.status).toBe('fail');
      expect(maliciousResponse.body.message).toMatch(/CSRF verification failed/i);
    });

    it('should accept state-changing requests matching the configured CLIENT_URL origin', async () => {
      const legitimateResponse = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(validRegistration);

      expect(legitimateResponse.status).toBe(201);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Correction 1 — Cookie clearing attributes
  // ─────────────────────────────────────────────────────────────────────────
  describe('Cookie clearing on logout', () => {
    it('should clear teamforge.sid with HttpOnly and SameSite attributes on logout', async () => {
      const agent = request.agent(app);

      await agent
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(validRegistration);

      const logoutResponse = await agent
        .post('/api/auth/logout')
        .set('Origin', 'http://localhost:5173');

      expect(logoutResponse.status).toBe(200);

      const cookies = logoutResponse.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const clearedCookie = cookies.find((c) => c.startsWith('teamforge.sid='));
      expect(clearedCookie).toBeDefined();
      // Cookie should have matching attributes so the browser removes it
      expect(clearedCookie).toMatch(/HttpOnly/i);
      expect(clearedCookie).toMatch(/SameSite=Lax/i);
      expect(clearedCookie).toMatch(/Path=\//i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Correction 2 — Zod v4: missing required fields produce meaningful messages
  // ─────────────────────────────────────────────────────────────────────────
  describe('Zod v4 validation messages', () => {
    it('should return field errors when required fields are entirely absent', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send({}); // No fields at all

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/Validation error/i);
      // All three required fields must appear in the field-error map
      expect(response.body.errors).toHaveProperty('fullName');
      expect(response.body.errors).toHaveProperty('email');
      expect(response.body.errors).toHaveProperty('password');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Correction 4 — Login timing: non-existent email still invokes dummy compare
  // ─────────────────────────────────────────────────────────────────────────
  describe('Login timing normalization', () => {
    it('should return 401 for a non-existent email within a timing comparable to a wrong-password rejection', async () => {
      const start = Date.now();
      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ email: 'ghost@example.com', password: 'AnyPassword1!' });
      const elapsed = Date.now() - start;

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid email or password.');
      // The dummy bcrypt compare must have run: bcrypt with cost 12 takes > 100ms
      expect(elapsed).toBeGreaterThan(100);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Correction 6 — Stale session: cookie cleared when user is deleted
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stale session cleanup', () => {
    it('should return 401 and clear the session cookie when the session user no longer exists', async () => {
      const agent = request.agent(app);

      // Establish a valid session
      await agent
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:5173')
        .send(validRegistration);

      // Confirm the session is active
      const meBeforeDelete = await agent.get('/api/auth/me');
      expect(meBeforeDelete.status).toBe(200);

      // Simulate the user being deleted from the database
      simulateDeletedUser = true;

      const meAfterDelete = await agent.get('/api/auth/me');

      expect(meAfterDelete.status).toBe(401);
      expect(meAfterDelete.body.message).toBe('User account not found. Please log in again.');

      // The response must include a Set-Cookie header clearing teamforge.sid
      const cookies = meAfterDelete.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const clearedCookie = cookies.find((c) => c.startsWith('teamforge.sid='));
      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toMatch(/HttpOnly/i);
    });
  });
});
