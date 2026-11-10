import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('404 Not Found Handling', () => {
  it('should return 404 for undefined routes', async () => {
    const response = await request(app).get('/api/unknown-endpoint');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toEqual({
      status: 'fail',
      message: 'Cannot GET /api/unknown-endpoint'
    });
  });
});
