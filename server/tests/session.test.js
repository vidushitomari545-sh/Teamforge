import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { sessionMiddleware } from '../src/config/session.js';

vi.mock('../src/config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

describe('Session Configuration & Middleware', () => {
  it('should validate and load a non-empty sessionSecret', () => {
    expect(config.sessionSecret).toBeDefined();
    expect(config.sessionSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('should not set session cookie on unauthenticated GET /api/health when saveUninitialized is false', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    // saveUninitialized: false prevents creating and persisting empty session cookies for read-only requests
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('should configure teamforge.sid cookie with HttpOnly, SameSite=Lax, and Path=/ when session is modified', async () => {
    const testApp = express();
    testApp.use(sessionMiddleware);
    testApp.post('/login', (req, res) => {
      req.session.userId = 'user-12345';
      res.status(200).json({ status: 'success' });
    });

    const response = await request(testApp).post('/login');

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toBeDefined();

    const cookies = response.headers['set-cookie'];
    const sessionCookie = cookies.find((c) => c.startsWith('teamforge.sid='));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).toMatch(/Path=\//i);
  });

  it('should maintain session state across sequential requests using supertest agent', async () => {
    const testApp = express();
    testApp.use(sessionMiddleware);
    testApp.post('/login', (req, res) => {
      req.session.userId = 'user-12345';
      res.status(200).json({ status: 'success' });
    });
    testApp.get('/profile', (req, res) => {
      if (!req.session.userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      res.status(200).json({ userId: req.session.userId });
    });

    const agent = request.agent(testApp);

    // 1. Establish session
    const loginRes = await agent.post('/login');
    expect(loginRes.status).toBe(200);

    // 2. Retain session on subsequent request
    const profileRes = await agent.get('/profile');
    expect(profileRes.status).toBe(200);
    expect(profileRes.body).toEqual({ userId: 'user-12345' });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Correction 2 — CLIENT_URL trailing-slash normalization
// ─────────────────────────────────────────────────────────────────────────
describe('CLIENT_URL trailing-slash normalization', () => {
  it('config.clientUrl should not have a trailing slash', async () => {
    const { config } = await import('../src/config/env.js');
    expect(config.clientUrl).toBeTruthy();
    expect(config.clientUrl.endsWith('/')).toBe(false);
  });

  it('CSRF middleware should still reject an untrusted origin when clientUrl has no trailing slash', async () => {
    const response = await request(app)
      .post('/api/auth/login')    // POST /api/auth/login is protected by csrfProtection
      .set('Origin', 'http://evil.example.com')
      .send({ email: 'test@example.com', password: 'Password1!' });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/CSRF verification failed/i);
  });
});
