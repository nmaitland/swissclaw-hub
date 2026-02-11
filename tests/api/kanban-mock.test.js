const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');

/**
 * High-level contract test for the Kanban API to ensure
 * the route is wired up and responds with the expected shape.
 * This complements the more detailed tests in tests/integration.
 */

describe('Kanban API contract', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('responds with 200 and expected top-level keys', async () => {
    const response = await request(app)
      .get('/api/kanban')
      .expect(200);

    expect(response.body).toHaveProperty('columns');
    expect(response.body).toHaveProperty('tasks');
  });
});
