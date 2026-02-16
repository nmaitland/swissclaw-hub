const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Auth edge cases', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  describe('POST /api/login', () => {
    it('returns a token on valid credentials', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: process.env.AUTH_USERNAME || 'admin',
          password: process.env.AUTH_PASSWORD || 'changeme123',
        })
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
    it('GET /api/status requires authentication', async () => {
      await request(app)
        .get('/api/status')
        .expect(401);

      // Should work with auth token
      await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('GET /api/kanban requires authentication', async () => {
      await request(app)
        .get('/api/kanban')
        .expect(401);

      // Should work with auth token
      await request(app)
        .get('/api/kanban')
        .set('Authorization', `Bearer ${authToken}`)
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

    it('GET /api/messages requires authentication', async () => {
      await request(app)
        .get('/api/messages')
        .expect(401);

      // Should work with auth token
      const response = await request(app)
        .get('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('POST /api/seed requires authentication', async () => {
      await request(app)
        .post('/api/seed')
        .expect(401);

      // Should work with auth token
      await request(app)
        .post('/api/seed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
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
