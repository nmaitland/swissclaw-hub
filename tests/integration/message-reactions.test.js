const request = require('supertest');
const { app, pool, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Message Reactions API', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  const createMessage = async (conversationId = null) => {
    const result = await pool.query(
      'INSERT INTO messages (sender, content, conversation_id) VALUES ($1, $2, $3) RETURNING id',
      ['Neil', 'Test message for reactions', conversationId]
    );
    return result.rows[0].id;
  };

  describe('POST /api/service/messages/:id/reactions', () => {
    it('adds a reaction to a message', async () => {
      const messageId = await createMessage();
      const response = await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(201);

      expect(response.body).toHaveProperty('messageId', messageId);
      expect(response.body).toHaveProperty('reactor', 'Neil');
      expect(response.body).toHaveProperty('emoji', '👍');
      expect(response.body).toHaveProperty('reactionId');
      expect(response.body).toHaveProperty('createdAt');
    });

    it('rejects missing bearer token', async () => {
      const messageId = await createMessage();
      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(401);
    });

    it('rejects missing reactor', async () => {
      const messageId = await createMessage();
      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' })
        .expect(400);
    });

    it('rejects missing emoji', async () => {
      const messageId = await createMessage();
      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil' })
        .expect(400);
    });

    it('rejects reactor longer than 50 characters', async () => {
      const messageId = await createMessage();
      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'a'.repeat(51), emoji: '👍' })
        .expect(400);
    });

    it('rejects emoji longer than 10 characters', async () => {
      const messageId = await createMessage();
      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '🎉🎉🎉🎉🎉🎉' }) // More than 10 chars
        .expect(400);
    });

    it('returns 404 for non-existent message', async () => {
      await request(app)
        .post('/api/service/messages/99999/reactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(404);
    });

    it('rejects duplicate reaction (same reactor, same emoji)', async () => {
      const messageId = await createMessage();

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(201);

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(409);
    });

    it('allows multiple different reactions from same reactor', async () => {
      const messageId = await createMessage();

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(201);

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '✅' })
        .expect(201);
    });

    it('allows multiple reactors with same emoji', async () => {
      const messageId = await createMessage();

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(201);

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Fran', emoji: '👍' })
        .expect(201);
    });
  });

  describe('DELETE /api/service/messages/:id/reactions/:emoji', () => {
    it('removes a reaction from a message', async () => {
      const messageId = await createMessage();

      // Add reaction first
      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(201);

      // Remove it
      const response = await request(app)
        .delete(`/api/service/messages/${messageId}/reactions/%F0%9F%91%8D`) // URL-encoded 👍
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil' })
        .expect(200);

      expect(response.body).toHaveProperty('messageId', messageId);
      expect(response.body).toHaveProperty('reactor', 'Neil');
      expect(response.body).toHaveProperty('emoji', '👍');
    });

    it('rejects missing bearer token', async () => {
      const messageId = await createMessage();
      await request(app)
        .delete(`/api/service/messages/${messageId}/reactions/%F0%9F%91%8D`)
        .send({ reactor: 'Neil' })
        .expect(401);
    });

    it('rejects missing reactor', async () => {
      const messageId = await createMessage();
      await request(app)
        .delete(`/api/service/messages/${messageId}/reactions/%F0%9F%91%8D`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('returns 404 for non-existent message', async () => {
      await request(app)
        .delete('/api/service/messages/99999/reactions/%F0%9F%91%8D')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil' })
        .expect(404);
    });

    it('returns 404 for non-existent reaction', async () => {
      const messageId = await createMessage();
      await request(app)
        .delete(`/api/service/messages/${messageId}/reactions/%F0%9F%91%8D`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil' })
        .expect(404);
    });
  });

  describe('GET /api/messages/:id/reactions', () => {
    it('returns empty array for message with no reactions', async () => {
      const messageId = await createMessage();
      const response = await request(app)
        .get(`/api/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('returns all reactions for a message', async () => {
      const messageId = await createMessage();

      // Add multiple reactions
      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' });

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Fran', emoji: '👍' });

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '✅' });

      const response = await request(app)
        .get(`/api/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(3);
      expect(response.body.map(r => r.emoji)).toContain('👍');
      expect(response.body.map(r => r.emoji)).toContain('✅');
    });

    it('returns reactions ordered by created_at', async () => {
      const messageId = await createMessage();

      // Add reactions with slight delay to ensure ordering
      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' });

      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Fran', emoji: '✅' });

      const response = await request(app)
        .get(`/api/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].emoji).toBe('👍');
      expect(response.body[1].emoji).toBe('✅');
    });

    it('rejects missing bearer token', async () => {
      const messageId = await createMessage();
      await request(app)
        .get(`/api/messages/${messageId}/reactions`)
        .expect(401);
    });

    it('returns empty array for non-existent message (no error)', async () => {
      const response = await request(app)
        .get('/api/messages/99999/reactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/service/messages/:id/reactions (conversationId)', () => {
    it('includes conversationId in the response', async () => {
      const convId = 'test-conv-123';
      const messageId = await createMessage(convId);
      const response = await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(201);

      expect(response.body).toHaveProperty('conversationId', convId);
    });

    it('includes null conversationId when message has no conversation', async () => {
      const messageId = await createMessage(null);
      const response = await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' })
        .expect(201);

      expect(response.body).toHaveProperty('conversationId', null);
    });
  });

  describe('GET /api/messages (reactions included)', () => {
    it('includes reactions array on each message', async () => {
      const convId = 'reactions-inline-test';
      const messageId = await createMessage(convId);

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' });

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Fran', emoji: '❤️' });

      const response = await request(app)
        .get(`/api/messages?conversationId=${encodeURIComponent(convId)}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const msg = response.body.find(m => m.id === messageId);
      expect(msg).toBeDefined();
      expect(msg.reactions).toHaveLength(2);
      expect(msg.reactions.map(r => r.emoji)).toContain('👍');
      expect(msg.reactions.map(r => r.emoji)).toContain('❤️');
    });

    it('includes empty reactions array for messages with no reactions', async () => {
      const convId = 'no-reactions-test';
      const messageId = await createMessage(convId);

      const response = await request(app)
        .get(`/api/messages?conversationId=${encodeURIComponent(convId)}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const msg = response.body.find(m => m.id === messageId);
      expect(msg).toBeDefined();
      expect(msg.reactions).toEqual([]);
    });
  });

  describe('DELETE /api/service/messages/:id/reactions/:emoji (conversationId)', () => {
    it('includes conversationId in the response', async () => {
      const convId = 'delete-conv-test';
      const messageId = await createMessage(convId);

      await request(app)
        .post(`/api/service/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil', emoji: '👍' });

      const response = await request(app)
        .delete(`/api/service/messages/${messageId}/reactions/%F0%9F%91%8D`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reactor: 'Neil' })
        .expect(200);

      expect(response.body).toHaveProperty('conversationId', convId);
    });
  });
});