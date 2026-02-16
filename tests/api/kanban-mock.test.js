const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

/**
 * High-level contract test for the Kanban API to ensure
 * the route is wired up and responds with the expected shape.
 * This complements the more detailed tests in tests/integration.
 */

describe('Kanban API contract', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  it('responds with 200 and expected top-level keys', async () => {
    const response = await request(app)
      .get('/api/kanban')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('columns');
    expect(response.body).toHaveProperty('tasks');
  });
});
