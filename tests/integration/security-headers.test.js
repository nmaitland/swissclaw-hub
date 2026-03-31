const request = require('supertest');
const { app } = require('../../server/index');

describe('Security middleware integration', () => {
  describe('Security headers (helmet)', () => {
    it('sets Strict-Transport-Security header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
      expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    });

    it('sets X-Content-Type-Options header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets Referrer-Policy header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('sets Content-Security-Policy header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    });
  });

  describe('Rate limiting', () => {
    it('includes rate limit headers on non-skipped routes', async () => {
      const res = await request(app).get('/api/build');
      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
    });

    it('skips rate limiting for /health endpoint', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      // Health is skipped by generalRateLimit, so no rate limit headers
      expect(res.headers['ratelimit-limit']).toBeUndefined();
    });
  });
});
