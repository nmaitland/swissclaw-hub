const request = require('supertest');
const { app, pool, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Status API (real server)', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  describe('GET /api/status', () => {
    it('returns compact status snapshot shape', async () => {
      const response = await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('state');
      expect(response.body).toHaveProperty('currentTask');
      expect(response.body).toHaveProperty('lastActive');
      expect(response.body).toHaveProperty('chatCount');
      expect(response.body).toHaveProperty('activityCount');
      expect(response.body).toHaveProperty('modelUsage');
      expect(response.body).not.toHaveProperty('recentMessages');
      expect(response.body).not.toHaveProperty('recentActivities');
    });

    it('returns counts as numbers', async () => {
      const response = await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(response.body).toHaveProperty('chatCount');
      expect(typeof response.body.activityCount).toBe('number');
      expect(typeof response.body.chatCount).toBe('number');
    });
  });

  describe('PUT /api/service/status', () => {
    it('updates the status with bearer session token', async () => {
      const lastActive = new Date().toISOString();
      const response = await request(app)
        .put('/api/service/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'busy', currentTask: 'Testing status update', lastActive })
        .expect(200);

      expect(response.body).toHaveProperty('state', 'busy');
      expect(response.body).toHaveProperty('currentTask', 'Testing status update');
      expect(response.body).toHaveProperty('lastActive', lastActive);
    });

    it('rejects missing bearer token', async () => {
      await request(app)
        .put('/api/service/status')
        .send({ state: 'active', currentTask: 'Test', lastActive: new Date().toISOString() })
        .expect(401);
    });

    it('rejects invalid state values', async () => {
      await request(app)
        .put('/api/service/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'invalid', currentTask: 'Test', lastActive: new Date().toISOString() })
        .expect(400);
    });

    it('rejects missing currentTask', async () => {
      await request(app)
        .put('/api/service/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'active', lastActive: new Date().toISOString() })
        .expect(400);
    });

    it('rejects missing lastActive', async () => {
      await request(app)
        .put('/api/service/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'active', currentTask: 'Testing' })
        .expect(400);
    });

    it('GET /api/status reflects the updated status', async () => {
      const lastActive = new Date().toISOString();
      // First update the status
      await request(app)
        .put('/api/service/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'active', currentTask: 'Integration testing', lastActive })
        .expect(200);

      // Then verify it's returned by GET /api/status
      const response = await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('state', 'active');
      expect(response.body).toHaveProperty('currentTask', 'Integration testing');
      expect(response.body).toHaveProperty('lastActive', lastActive);
    });
  });

  describe('PUT /api/service/model-usage + GET /api/status modelUsage', () => {
    it('upserts daily snapshot and returns latest on status', async () => {
      const usageDate = '2026-02-24';
      const updatedAt = new Date().toISOString();

      const payload = {
        usageDate,
        updatedAt,
        models: [
          {
            model: 'gpt-5.3-codex',
            provider: 'openai-codex',
            source: 'openai',
            inputTokens: 1000,
            outputTokens: 100,
            requestCount: 10,
            costs: [
              { type: 'paid', amount: 0.5 },
              { type: 'free_tier_potential', amount: 0.25 },
            ],
          },
        ],
      };

      const putRes = await request(app)
        .put('/api/service/model-usage')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(200);

      expect(putRes.body).toHaveProperty('usageDate', usageDate);
      expect(putRes.body).toHaveProperty('models');
      expect(putRes.body).toHaveProperty('totals');
      expect(putRes.body.totals).toHaveProperty('totalTokens', 1100);
      expect(putRes.body.totals).toHaveProperty('requestCount', 10);

      const statusRes = await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(statusRes.body.modelUsage).toBeTruthy();
      expect(statusRes.body.modelUsage).toHaveProperty('usageDate', usageDate);
      expect(statusRes.body.modelUsage.totals).toHaveProperty('inputTokens', 1000);
    });
  });
});
