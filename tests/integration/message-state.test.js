const request = require('supertest');
const { app, pool, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Message State API (real server)', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  const createMessage = async () => {
    const result = await pool.query(
      "INSERT INTO messages (sender, content) VALUES ('Neil', 'Test message') RETURNING id"
    );
    return result.rows[0].id;
  };

  describe('PUT /api/service/messages/:id/state', () => {
    it('updates message state with bearer session token', async () => {
      const messageId = await createMessage();
      const response = await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'received' })
        .expect(200);

      expect(response.body).toHaveProperty('id', messageId);
      expect(response.body).toHaveProperty('state', 'received');
      expect(response.body).toHaveProperty('claimed', true);
    });

    it('returns claimed=false when received is already claimed', async () => {
      const messageId = await createMessage();

      const firstClaim = await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'received' })
        .expect(200);

      const secondClaim = await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'received' })
        .expect(200);

      expect(firstClaim.body).toHaveProperty('claimed', true);
      expect(secondClaim.body).toHaveProperty('claimed', false);
    });

    it('allows only one successful claim for concurrent received requests', async () => {
      const messageId = await createMessage();

      const [claimA, claimB] = await Promise.all([
        request(app)
          .put(`/api/service/messages/${messageId}/state`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ state: 'received' })
          .expect(200),
        request(app)
          .put(`/api/service/messages/${messageId}/state`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ state: 'received' })
          .expect(200),
      ]);

      const claimedValues = [claimA.body.claimed, claimB.body.claimed];
      const trueCount = claimedValues.filter((value) => value === true).length;
      const falseCount = claimedValues.filter((value) => value === false).length;

      expect(trueCount).toBe(1);
      expect(falseCount).toBe(1);
    });

    it('accepts non-received state values and returns claimed=true', async () => {
      const states = ['processing', 'thinking', 'responded'];

      for (const state of states) {
        const messageId = await createMessage();
        const response = await request(app)
          .put(`/api/service/messages/${messageId}/state`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ state })
          .expect(200);

        expect(response.body.state).toBe(state);
        expect(response.body).toHaveProperty('claimed', true);
      }
    });

    it('rejects missing bearer token', async () => {
      const messageId = await createMessage();
      await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .send({ state: 'received' })
        .expect(401);
    });

    it('rejects invalid state values', async () => {
      const messageId = await createMessage();
      await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'invalid-state' })
        .expect(400);
    });

    it('rejects missing state', async () => {
      const messageId = await createMessage();
      await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('returns 404 for non-existent message', async () => {
      await request(app)
        .put('/api/service/messages/99999/state')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'received' })
        .expect(404);
    });
  });
});
