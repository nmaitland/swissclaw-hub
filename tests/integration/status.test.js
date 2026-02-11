const request = require('supertest');
const { app, pool, resetTestDb } = require('../../server/index');

describe('Status API (real server)', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  describe('GET /api/status', () => {
    it('returns status data with recent messages and activities arrays', async () => {
      const response = await request(app)
        .get('/api/status')
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
        .expect(200);
      expect(response.body).toHaveProperty('status', 'online');
      expect(response.body).toHaveProperty('swissclaw');
      expect(response.body.recentMessages).toEqual(expect.any(Array));
      expect(response.body.recentActivities).toEqual(expect.any(Array));
    });
  });
});
