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
    it('returns status data with recent messages and activities arrays', async () => {
      const response = await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('recentMessages');
      expect(response.body).toHaveProperty('recentActivities');
      expect(Array.isArray(response.body.recentMessages)).toBe(true);
      expect(Array.isArray(response.body.recentActivities)).toBe(true);
    });

    it('returns messages ordered by created_at descending when data exists', async () => {
      // Insert a couple of messages out of order, then rely on the query ordering
      await pool.query(
        "INSERT INTO messages (sender, content, created_at) VALUES ('test', 'older', NOW() - INTERVAL '2 minutes')"
      );
      await pool.query(
        "INSERT INTO messages (sender, content, created_at) VALUES ('test', 'newer', NOW())"
      );

      const response = await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const messages = response.body.recentMessages;
      if (messages.length > 1) {
        for (let i = 0; i < messages.length - 1; i++) {
          const currentDate = new Date(messages[i].created_at);
          const nextDate = new Date(messages[i + 1].created_at);
          expect(currentDate >= nextDate).toBe(true);
        }
      }
    });

    it('returns valid shape when no messages or activities exist', async () => {
      // Just ensure the endpoint returns the expected keys even with empty data
      const response = await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(response.body).toHaveProperty('status', 'online');
      expect(response.body).toHaveProperty('swissclaw');
      expect(response.body.recentMessages).toEqual(expect.any(Array));
      expect(response.body.recentActivities).toEqual(expect.any(Array));
    });

    it('returns activityCount and modelUsage in status response', async () => {
      const response = await request(app)
        .get('/api/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check activityCount exists and is a number
      expect(response.body).toHaveProperty('activityCount');
      expect(typeof response.body.activityCount).toBe('number');

      // Check modelUsage exists with correct structure
      expect(response.body).toHaveProperty('modelUsage');
      expect(response.body.modelUsage).toHaveProperty('total');
      expect(response.body.modelUsage).toHaveProperty('byModel');
      expect(response.body.modelUsage).toHaveProperty('since');

      // Check total structure
      expect(response.body.modelUsage.total).toHaveProperty('inputTokens');
      expect(response.body.modelUsage.total).toHaveProperty('outputTokens');
      expect(response.body.modelUsage.total).toHaveProperty('estimatedCost');
      expect(typeof response.body.modelUsage.total.inputTokens).toBe('number');
      expect(typeof response.body.modelUsage.total.outputTokens).toBe('number');
      expect(typeof response.body.modelUsage.total.estimatedCost).toBe('number');

      // Check byModel is an array
      expect(Array.isArray(response.body.modelUsage.byModel)).toBe(true);
    });
  });
});
