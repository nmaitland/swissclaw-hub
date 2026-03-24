const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Conversation-scoped chat (real server)', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  describe('POST /api/service/messages with conversationId', () => {
    it('stores conversation_id when provided', async () => {
      const response = await request(app)
        .post('/api/service/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sender: 'Swissclaw',
          content: 'Reply to user',
          conversationId: 'user1:example.com',
        })
        .expect(200);

      expect(response.body.conversation_id).toBe('user1:example.com');
    });

    it('stores null conversation_id when not provided', async () => {
      const response = await request(app)
        .post('/api/service/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sender: 'Swissclaw',
          content: 'Global message',
        })
        .expect(200);

      expect(response.body.conversation_id).toBeNull();
    });

    it('rejects invalid conversationId type', async () => {
      const response = await request(app)
        .post('/api/service/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sender: 'Swissclaw',
          content: 'Test',
          conversationId: 12345,
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid conversationId');
    });

    it('rejects conversationId exceeding max length', async () => {
      const response = await request(app)
        .post('/api/service/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sender: 'Swissclaw',
          content: 'Test',
          conversationId: 'x'.repeat(201),
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid conversationId');
    });
  });

  describe('GET /api/messages with conversationId filter', () => {
    beforeAll(async () => {
      await resetTestDb();
      authToken = await getAuthToken();

      // Seed messages for two different conversations and one global
      const messages = [
        { sender: 'Alice', content: 'Alice msg 1', conversationId: 'alice:app.example.com' },
        { sender: 'Swissclaw', content: 'Reply to Alice', conversationId: 'alice:app.example.com' },
        { sender: 'Bob', content: 'Bob msg 1', conversationId: 'bob:app.example.com' },
        { sender: 'Swissclaw', content: 'Reply to Bob', conversationId: 'bob:app.example.com' },
        { sender: 'System', content: 'Global announcement' },
      ];

      for (const msg of messages) {
        await request(app)
          .post('/api/service/messages')
          .set('Authorization', `Bearer ${authToken}`)
          .send(msg)
          .expect(200);
      }
    });

    it('returns only messages for the specified conversation', async () => {
      const response = await request(app)
        .get('/api/messages?conversationId=alice:app.example.com')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      response.body.forEach((msg) => {
        expect(msg.conversation_id).toBe('alice:app.example.com');
      });
    });

    it('returns different messages for a different conversation', async () => {
      const response = await request(app)
        .get('/api/messages?conversationId=bob:app.example.com')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      response.body.forEach((msg) => {
        expect(msg.conversation_id).toBe('bob:app.example.com');
      });
    });

    it('does not return messages from other conversations', async () => {
      const response = await request(app)
        .get('/api/messages?conversationId=alice:app.example.com')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const senders = response.body.map((m) => m.sender);
      expect(senders).not.toContain('Bob');
      expect(senders).not.toContain('System');
    });

    it('returns empty array for nonexistent conversation', async () => {
      const response = await request(app)
        .get('/api/messages?conversationId=nobody:nowhere.com')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('returns all messages when no conversationId filter', async () => {
      const response = await request(app)
        .get('/api/messages?limit=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(5);
    });

    it('supports pagination with conversationId filter', async () => {
      // Get first page
      const page1 = await request(app)
        .get('/api/messages?conversationId=alice:app.example.com&limit=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(page1.body).toHaveLength(1);

      // Get second page using cursor
      const page2 = await request(app)
        .get(`/api/messages?conversationId=alice:app.example.com&limit=1&before=${page1.body[0].created_at}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(page2.body).toHaveLength(1);
      expect(page2.body[0].id).not.toBe(page1.body[0].id);
    });
  });

  describe('PUT /api/service/messages/:id/state with conversation_id', () => {
    it('returns conversation_id in state update response', async () => {
      // Create a message with conversationId
      const createRes = await request(app)
        .post('/api/service/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sender: 'User',
          content: 'State test message',
          conversationId: 'statetest:example.com',
        })
        .expect(200);

      const messageId = createRes.body.id;

      // Claim it (transition NULL -> received)
      const stateRes = await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'received' })
        .expect(200);

      expect(stateRes.body.claimed).toBe(true);
      expect(stateRes.body.state).toBe('received');
    });

    it('processes state transitions for conversation-scoped messages', async () => {
      const createRes = await request(app)
        .post('/api/service/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sender: 'User',
          content: 'Transition test',
          conversationId: 'transition:example.com',
        })
        .expect(200);

      const messageId = createRes.body.id;

      // received -> processing -> done
      await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'received' })
        .expect(200);

      await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'processing' })
        .expect(200);

      await request(app)
        .put(`/api/service/messages/${messageId}/state`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'done' })
        .expect(200);

      // Verify the message still has its conversation_id
      const messages = await request(app)
        .get('/api/messages?conversationId=transition:example.com')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const msg = messages.body.find((m) => m.id === messageId);
      expect(msg).toBeDefined();
      expect(msg.conversation_id).toBe('transition:example.com');
      expect(msg.processing_state).toBe('done');
    });
  });
});
