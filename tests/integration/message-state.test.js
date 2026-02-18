const request = require('supertest');
const { app, pool, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Message State API (real server)', () => {
  let authToken;
  let messageId;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();

    // Insert a test message
    const result = await pool.query(
      "INSERT INTO messages (sender, content) VALUES ('Neil', 'Test message') RETURNING id"
    );
    messageId = result.rows[0].id;
  });

  const SWISSCLAW_TOKEN = process.env.SWISSCLAW_TOKEN || 'dev-token-change-in-production';

  describe('PUT /api/service/messages/:id/state', () => {
    it('updates message state with valid service token', async () => {
      const response = await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('X-Service-Token', SWISSCLAW_TOKEN)
        .send({ state: 'received' })
        .expect(200);

      expect(response.body).toHaveProperty('id', messageId);
      expect(response.body).toHaveProperty('state', 'received');
    });

    it('accepts all valid state values', async () => {
      const states = ['received', 'processing', 'thinking', 'responded'];

      for (const state of states) {
        const response = await request(app)
          .put(`/api/service/messages/${messageId}/state`)
          .set('X-Service-Token', SWISSCLAW_TOKEN)
          .send({ state })
          .expect(200);

        expect(response.body.state).toBe(state);
      }
    });

    it('rejects invalid service token', async () => {
      await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('X-Service-Token', 'invalid-token')
        .send({ state: 'received' })
        .expect(401);
    });

    it('rejects invalid state values', async () => {
      await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('X-Service-Token', SWISSCLAW_TOKEN)
        .send({ state: 'invalid-state' })
        .expect(400);
    });

    it('rejects missing state', async () => {
      await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('X-Service-Token', SWISSCLAW_TOKEN)
        .send({})
        .expect(400);
    });

    it('returns 404 for non-existent message', async () => {
      await request(app)
        .put('/api/service/messages/99999/state')
        .set('X-Service-Token', SWISSCLAW_TOKEN)
        .send({ state: 'received' })
        .expect(404);
    });
  });
});
