const request = require('supertest');
const { app } = require('../../server/index');

describe('Legacy Tasks API', () => {
  describe('GET /api/tasks', () => {
    it('returns an array', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('returns task objects with expected fields when tasks exist', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .expect(200);

      // Even if empty, it should be an array
      if (response.body.length > 0) {
        const task = response.body[0];
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('title');
        expect(task).toHaveProperty('completed');
        expect(task).toHaveProperty('priority');
      }
    });
  });
});
