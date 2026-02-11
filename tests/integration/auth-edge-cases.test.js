const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');

describe('Auth edge cases', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  describe('POST /api/login', () => {
    it('returns a token on valid credentials', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'changeme123' })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it('returns 401 on wrong password', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'wrongpassword' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('returns 401 on wrong username', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({ username: 'nobody', password: 'changeme123' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('returns error on empty body', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({});

      // Should return 400 or 401
      expect([400, 401]).toContain(response.status);
    });

    it('returns error when username is missing', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({ password: 'changeme123' });

      expect([400, 401]).toContain(response.status);
    });

    it('returns error when password is missing', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({ username: 'admin' });

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('Auth middleware - protected routes', () => {
    it('GET /api/status is accessible without auth (public)', async () => {
      await request(app)
        .get('/api/status')
        .expect(200);
    });

    it('GET /api/kanban is accessible without auth (public)', async () => {
      await request(app)
        .get('/api/kanban')
        .expect(200);
    });

    it('GET /health is accessible without auth (public)', async () => {
      await request(app)
        .get('/health')
        .expect(200);
    });

    it('GET /api/build is accessible without auth (public)', async () => {
      await request(app)
        .get('/api/build')
        .expect(200);
    });

    it('GET /api/messages requires auth', async () => {
      const response = await request(app)
        .get('/api/messages')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/authentication/i);
    });

    it('GET /api/messages works with valid token', async () => {
      // Login first
      const loginRes = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'changeme123' })
        .expect(200);

      const token = loginRes.body.token;

      await request(app)
        .get('/api/messages')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('returns 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/messages')
        .set('Authorization', 'Bearer invalid-token-12345')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /login', () => {
    it('returns HTML login page', async () => {
      const response = await request(app)
        .get('/login')
        .expect(200);

      expect(response.text).toContain('html');
      expect(response.text).toContain('login');
    });
  });
});
