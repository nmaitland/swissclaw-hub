const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Auth enforcement', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  describe('Protected endpoints require authentication', () => {
    it('GET /api/status returns 401 without auth', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('GET /api/messages returns 401 without auth', async () => {
      const response = await request(app)
        .get('/api/messages')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('GET /api/kanban returns 401 without auth', async () => {
      const response = await request(app)
        .get('/api/kanban')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('POST /api/kanban/tasks returns 401 without auth', async () => {
      const response = await request(app)
        .post('/api/kanban/tasks')
        .send({ columnName: 'todo', title: 'Test' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('PUT /api/kanban/tasks/:id returns 401 without auth', async () => {
      const response = await request(app)
        .put('/api/kanban/tasks/1')
        .send({ title: 'Updated' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('DELETE /api/kanban/tasks/:id returns 401 without auth', async () => {
      const response = await request(app)
        .delete('/api/kanban/tasks/1')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('POST /api/kanban/reorder returns 401 without auth', async () => {
      const response = await request(app)
        .post('/api/kanban/reorder')
        .send({ columnId: 1, taskPositions: [] })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('POST /api/activities returns 401 without auth', async () => {
      const response = await request(app)
        .post('/api/activities')
        .send({ type: 'test', description: 'Test' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('GET /api/activities returns 401 without auth', async () => {
      const response = await request(app)
        .get('/api/activities')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('POST /api/seed returns 401 without auth', async () => {
      const response = await request(app)
        .post('/api/seed')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('Public endpoints work without authentication', () => {
    it('GET /health returns 200 without auth', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('POST /api/login returns 200 without auth', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: process.env.AUTH_USERNAME || 'admin',
          password: process.env.AUTH_PASSWORD || 'changeme123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
    });

    it('GET /api/build returns 200 without auth', async () => {
      const response = await request(app)
        .get('/api/build')
        .expect(200);

      expect(response.body).toHaveProperty('commit');
    });

    it('GET /login returns 200 without auth', async () => {
      const response = await request(app)
        .get('/login')
        .expect(200);

      expect(response.text).toContain('Swissclaw Hub');
    });
  });

  describe('Invalid tokens are rejected', () => {
    it('GET /api/status returns 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/status')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('GET /api/status returns 200 with valid token', async () => {
      const response = await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'online');
    });
  });
});
