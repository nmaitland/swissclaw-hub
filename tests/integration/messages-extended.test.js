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

    it('defaults to max 25 messages', async () => {
      const response = await request(app)
        .get('/api/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(25);
    });

    it('supports explicit limit up to 200', async () => {
      const response = await request(app)
        .get('/api/messages?limit=200')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(200);
    });

    it('supports before cursor', async () => {
      await pool.query(
        "INSERT INTO messages (sender, content, created_at) VALUES ('test', 'cursor-old', NOW() - INTERVAL '20 minutes')"
      );
      await pool.query(
        "INSERT INTO messages (sender, content, created_at) VALUES ('test', 'cursor-new', NOW() - INTERVAL '1 minute')"
      );

      const before = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const response = await request(app)
        .get(`/api/messages?before=${encodeURIComponent(before)}&limit=20`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      for (const msg of response.body) {
        expect(new Date(msg.created_at).getTime()).toBeLessThan(new Date(before).getTime());
      }
    });
  });
});
