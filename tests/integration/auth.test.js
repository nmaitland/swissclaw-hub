const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');

describe('Auth API (real server)', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  describe('POST /api/login', () => {
    it('returns a token with valid credentials', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: process.env.AUTH_USERNAME || 'admin',
          password: process.env.AUTH_PASSWORD || 'changeme123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('success', true);
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it('returns 401 with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({ username: 'wrong', password: 'wrong' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid credentials');
      expect(response.body).not.toHaveProperty('token');
    });

    it('returns 400 with missing credentials', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /login', () => {
    it('serves the login HTML page', async () => {
      const response = await request(app)
        .get('/login')
        .expect(200);

      expect(response.text).toContain('Swissclaw Hub');
      expect(response.text).toContain('loginForm');
    });
  });
});
