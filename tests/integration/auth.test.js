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
          password: process.env.AUTH_PASSWORD || 'test-only-default',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('success', true);
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it('sets a readable hub_csrf cookie (not httpOnly) on successful login', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: process.env.AUTH_USERNAME || 'admin',
          password: process.env.AUTH_PASSWORD || 'test-only-default',
        })
        .expect(200);

      const setCookies = response.headers['set-cookie'] || [];
      const csrfCookie = setCookies.find((c) => c.startsWith('hub_csrf='));
      expect(csrfCookie).toBeDefined();
      // Must have a non-empty value
      expect(csrfCookie).toMatch(/^hub_csrf=[a-f0-9]+/);
      // Must NOT be httpOnly so browser JS can read it
      expect(csrfCookie.toLowerCase()).not.toContain('httponly');
    });

    it('returns 403 when a stale hub_auth cookie is present without a CSRF header', async () => {
      // Simulate the broken state: hub_auth cookie exists in the browser (httpOnly,
      // JS cannot clear it) but hub_csrf was already cleared by clearTokens().
      // The login form uses credentials:'omit' precisely to avoid this scenario;
      // this test documents that the CSRF middleware correctly rejects such requests.
      const response = await request(app)
        .post('/api/login')
        .set('Cookie', 'hub_auth=stale-token-value')
        .send({
          username: process.env.AUTH_USERNAME || 'admin',
          password: process.env.AUTH_PASSWORD || 'test-only-default',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/csrf/i);
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

      expect(response.text).toContain('loginForm');
    });
  });
});
