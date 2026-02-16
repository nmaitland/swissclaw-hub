const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Messages API (real server)', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  describe('GET /api/messages', () => {
    it('returns an array of messages', async () => {
      const response = await request(app)
        .get('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('returns messages with expected fields', async () => {
      const response = await request(app)
        .get('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Even if empty, the response should be an array
      if (response.body.length > 0) {
        const msg = response.body[0];
        expect(msg).toHaveProperty('id');
        expect(msg).toHaveProperty('sender');
        expect(msg).toHaveProperty('content');
        expect(msg).toHaveProperty('created_at');
      }
    });
  });
});
