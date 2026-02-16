const request = require('supertest');
const { app, pool, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Messages API extended', () => {
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

    it('returns messages ordered by created_at descending', async () => {
      // Insert test messages
      await pool.query(
        "INSERT INTO messages (sender, content, created_at) VALUES ('test', 'older msg', NOW() - INTERVAL '5 minutes')"
      );
      await pool.query(
        "INSERT INTO messages (sender, content, created_at) VALUES ('test', 'newer msg', NOW())"
      );

      const response = await request(app)
        .get('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      if (response.body.length >= 2) {
        const dates = response.body.map(m => new Date(m.created_at).getTime());
        for (let i = 0; i < dates.length - 1; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
        }
      }
    });

    it('limits to 50 messages', async () => {
      const response = await request(app)
        .get('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(50);
    });
  });
});
