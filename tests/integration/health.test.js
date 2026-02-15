const request = require('supertest');
const { app } = require('../../server/index');

describe('Health & Build API (real server)', () => {
  describe('GET /health', () => {
    it('returns ok status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('buildDate');
    });
  });

  describe('GET /api/build', () => {
    it('returns build info', async () => {
      const response = await request(app)
        .get('/api/build')
        .expect(200);

      expect(response.body).toHaveProperty('buildDate');
      expect(response.body).toHaveProperty('commit');
    });
  });
});
