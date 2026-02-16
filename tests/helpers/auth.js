const request = require('supertest');
const { app } = require('../../server/index');

/**
 * Get an authentication token for testing.
 * Logs in with default test credentials and returns the token.
 *
 * @returns {Promise<string>} The authentication token
 */
async function getAuthToken() {
  const res = await request(app)
    .post('/api/login')
    .send({
      username: process.env.AUTH_USERNAME || 'admin',
      password: process.env.AUTH_PASSWORD || 'changeme123',
    });

  if (!res.body.token) {
    throw new Error('Failed to get auth token: ' + JSON.stringify(res.body));
  }

  return res.body.token;
}

module.exports = { getAuthToken };
