const request = require('supertest');
const express = require('express');
const { testPool, setupTestDb, seedTestData } = require('../setup');

// Import the server app (we'll need to modify this to be exportable)
const app = express();

// Mock the server routes for testing
app.get('/api/status', async (req, res) => {
  try {
    const result = await testPool.query('SELECT * FROM status LIMIT 1');
    const status = result.rows[0] || {};
    
    const messagesResult = await testPool.query(
      'SELECT * FROM messages ORDER BY created_at DESC LIMIT 10'
    );
    const activitiesResult = await testPool.query(
      'SELECT * FROM activities ORDER BY created_at DESC LIMIT 10'
    );
    
    res.json({
      ...status,
      recentMessages: messagesResult.rows,
      recentActivities: activitiesResult.rows,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

describe('Status API', () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedTestData();
  });

  afterAll(async () => {
    await testPool.end();
  });

  beforeEach(async () => {
    await setupTestDb();
    await seedTestData();
  });

  describe('GET /api/status', () => {
    it('should return status data with recent messages and activities', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.body).toHaveProperty('recentMessages');
      expect(response.body).toHaveProperty('recentActivities');
      expect(Array.isArray(response.body.recentMessages)).toBe(true);
      expect(Array.isArray(response.body.recentActivities)).toBe(true);
    });

    it('should return messages in descending order by created_at', async () => {
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

    it('should handle database errors gracefully', async () => {
      // Close the connection to simulate an error
      await testPool.end();
      
      const response = await request(app)
        .get('/api/status')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
    });
  });
});
