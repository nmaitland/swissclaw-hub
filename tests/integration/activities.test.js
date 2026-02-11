const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');

describe('Activities API (real server)', () => {
  beforeAll(async () => {
    await resetTestDb();
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
        .send({ description: 'Missing type' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid type');
    });

    it('returns 400 with missing description', async () => {
      const response = await request(app)
        .post('/api/activities')
        .send({ type: 'test' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid description');
    });

    it('returns 400 when type exceeds max length', async () => {
      const response = await request(app)
        .post('/api/activities')
        .send({ type: 'a'.repeat(51), description: 'Valid description' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid type');
    });

    it('returns 400 when description exceeds max length', async () => {
      const response = await request(app)
        .post('/api/activities')
        .send({ type: 'test', description: 'a'.repeat(501) })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid description');
    });
  });

  describe('POST /api/service/activities', () => {
    it('creates an activity with valid service token', async () => {
      const serviceToken = process.env.SWISSCLAW_TOKEN || 'dev-token-change-in-production';

      const response = await request(app)
        .post('/api/service/activities')
        .set('x-service-token', serviceToken)
        .send({
          type: 'deploy',
          description: 'Automated deployment',
          metadata: { env: 'test' },
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type', 'deploy');
    });

    it('returns 401 with invalid service token', async () => {
      const response = await request(app)
        .post('/api/service/activities')
        .set('x-service-token', 'wrong-token')
        .send({ type: 'test', description: 'Should fail' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid service token');
    });

    it('returns 400 with missing required fields', async () => {
      const serviceToken = process.env.SWISSCLAW_TOKEN || 'dev-token-change-in-production';

      const response = await request(app)
        .post('/api/service/activities')
        .set('x-service-token', serviceToken)
        .send({ metadata: {} })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Type and description required');
    });
  });
});
