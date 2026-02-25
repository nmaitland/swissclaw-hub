const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Activities API (real server)', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  describe('POST /api/activities', () => {
    it('creates a new activity', async () => {
      const activity = {
        type: 'test',
        description: 'Integration test activity',
        metadata: { source: 'jest' },
      };

      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(activity)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type', 'test');
      expect(response.body).toHaveProperty('description', 'Integration test activity');
      expect(response.body).toHaveProperty('created_at');
    });

    it('returns 400 with missing type', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Missing type' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid type');
    });

    it('returns 400 with missing description', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'test' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid description');
    });

    it('returns 400 when type exceeds max length', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'a'.repeat(51), description: 'Valid description' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid type');
    });

    it('returns 400 when description exceeds max length', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'test', description: 'a'.repeat(501) })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid description');
    });
  });

  describe('GET /api/activities', () => {
    it('returns paginated activities with correct structure', async () => {
      const response = await request(app)
        .get('/api/activities?limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('hasMore');
      expect(typeof response.body.hasMore).toBe('boolean');
      expect(Array.isArray(response.body.activities)).toBe(true);
    });

    it('respects the limit parameter', async () => {
      const response = await request(app)
        .get('/api/activities?limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.activities.length).toBeLessThanOrEqual(5);
    });

    it('supports cursor-based pagination with before parameter', async () => {
      // Get first page
      const firstPage = await request(app)
        .get('/api/activities?limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // If we have activities, test pagination
      if (firstPage.body.activities.length > 0) {
        const oldestActivity = firstPage.body.activities[firstPage.body.activities.length - 1];
        
        const secondPage = await request(app)
          .get(`/api/activities?limit=2&before=${encodeURIComponent(oldestActivity.created_at)}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(secondPage.body).toHaveProperty('activities');
        expect(Array.isArray(secondPage.body.activities)).toBe(true);
      }
    });
  });

  describe('POST /api/service/activities', () => {
    it('creates an activity with bearer session token', async () => {
      const response = await request(app)
        .post('/api/service/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'deploy',
          description: 'Automated deployment',
          metadata: { env: 'test' },
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type', 'deploy');
    });

    it('returns 401 without bearer token', async () => {
      const response = await request(app)
        .post('/api/service/activities')
        .send({ type: 'test', description: 'Should fail' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('returns 400 with missing required fields', async () => {
      const response = await request(app)
        .post('/api/service/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ metadata: {} })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Type and description required');
    });
  });
});
