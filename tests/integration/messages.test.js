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

  describe('POST /api/service/messages', () => {
    const serviceToken = 'dev-token-change-in-production';

    it('creates a chat message with valid service token', async () => {
      const messageData = {
        sender: 'TestAgent',
        content: 'Hello from service endpoint test'
      };

      const response = await request(app)
        .post('/api/service/messages')
        .set('X-Service-Token', serviceToken)
        .send(messageData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.sender).toBe(messageData.sender);
      expect(response.body.content).toBe(messageData.content);
      expect(response.body).toHaveProperty('created_at');
    });

    it('rejects requests without service token', async () => {
      const response = await request(app)
        .post('/api/service/messages')
        .send({ sender: 'Test', content: 'Test' })
        .expect(401);

      expect(response.body.error).toBe('Invalid service token');
    });

    it('rejects requests with invalid service token', async () => {
      const response = await request(app)
        .post('/api/service/messages')
        .set('X-Service-Token', 'invalid-token')
        .send({ sender: 'Test', content: 'Test' })
        .expect(401);

      expect(response.body.error).toBe('Invalid service token');
    });

    it('validates sender field', async () => {
      const response = await request(app)
        .post('/api/service/messages')
        .set('X-Service-Token', serviceToken)
        .send({ content: 'Test' })
        .expect(400);

      expect(response.body.error).toBe('Invalid sender');
    });

    it('validates content field', async () => {
      const response = await request(app)
        .post('/api/service/messages')
        .set('X-Service-Token', serviceToken)
        .send({ sender: 'Test' })
        .expect(400);

      expect(response.body.error).toBe('Invalid content');
    });

    it('sanitizes sender and content', async () => {
      const response = await request(app)
        .post('/api/service/messages')
        .set('X-Service-Token', serviceToken)
        .send({
          sender: 'Test<script>alert(1)</script>',
          content: '<p>Hello</p>'
        })
        .expect(200);

      // Should have < and > removed
      expect(response.body.sender).not.toContain('<');
      expect(response.body.content).not.toContain('<');
    });

    it('creates an activity record for the message', async () => {
      const messageData = {
        sender: 'ActivityTest',
        content: 'Testing activity creation'
      };

      await request(app)
        .post('/api/service/messages')
        .set('X-Service-Token', serviceToken)
        .send(messageData)
        .expect(200);

      // Check that an activity was created
      const activitiesResponse = await request(app)
        .get('/api/activities?limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const chatActivity = activitiesResponse.body.activities.find(
        a => a.type === 'chat' && a.description.includes('ActivityTest')
      );

      expect(chatActivity).toBeDefined();
      expect(chatActivity.metadata.sender).toBe(messageData.sender);
    });
  });
});
