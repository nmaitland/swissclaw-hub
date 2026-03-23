const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Auth Routes (real server)', () => {
  let adminToken;
  // Pre-fetched tokens to avoid hitting rate limits
  let loginTestToken;
  let logoutTestToken;
  let validateTestToken;
  let meTestToken;
  let pwToken;

  beforeAll(async () => {
    await resetTestDb();
    adminToken = await getAuthToken();

    // Create all test users upfront via admin API (not rate-limited)
    await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'logintest@test.com', name: 'Login Test', password: 'TestPass1', role: 'user' });

    await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'lockout@test.com', name: 'Lockout Test', password: 'TestPass1', role: 'user' });

    await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'pwchange@test.com', name: 'PW Change', password: 'OldPass1x', role: 'user' });

    // Pre-fetch tokens (minimize /auth/login calls to stay under rate limit of 5)
    // Login 1: logintest user — reuse token for validate and me tests
    const login1 = await request(app)
      .post('/auth/login')
      .send({ email: 'logintest@test.com', password: 'TestPass1' });
    loginTestToken = login1.body.token;
    validateTestToken = login1.body.token;
    meTestToken = login1.body.token;

    // Login 2: logintest user — separate token for logout test (will be revoked)
    const login2 = await request(app)
      .post('/auth/login')
      .send({ email: 'logintest@test.com', password: 'TestPass1' });
    logoutTestToken = login2.body.token;

    // Login 3: pwchange user
    const login3 = await request(app)
      .post('/auth/login')
      .send({ email: 'pwchange@test.com', password: 'OldPass1x' });
    pwToken = login3.body.token;
  });

  // ── POST /auth/login (basic validation — no rate-limited calls) ──────

  describe('POST /auth/login', () => {
    it('returns token with valid credentials', async () => {
      expect(loginTestToken).toBeTruthy();
    });

    it('returns 401 with wrong password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'logintest@test.com', password: 'WrongPass1' })
        .expect(401);

      expect(res.body.error).toMatch(/invalid credentials/i);
      expect(res.body).toHaveProperty('remainingAttempts');
    });

    it('returns 401 for non-existent user', async () => {
      await request(app)
        .post('/auth/login')
        .send({ email: 'nobody@test.com', password: 'TestPass1' })
        .expect(401);
    });

    it('returns 400 for missing credentials', async () => {
      await request(app)
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('returns 400 for invalid email format', async () => {
      await request(app)
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'TestPass1' })
        .expect(400);
    });
  });

  // ── POST /auth/logout ────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('revokes the session token', async () => {
      // Logout
      await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${logoutTestToken}`)
        .expect(200);

      // Token should no longer be valid
      await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${logoutTestToken}`)
        .expect(401);
    });

    it('returns 400 without token', async () => {
      await request(app)
        .post('/auth/logout')
        .expect(400);
    });
  });

  // ── GET /auth/validate ───────────────────────────────────────────────

  describe('GET /auth/validate', () => {
    it('returns valid session info', async () => {
      const res = await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${validateTestToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('valid', true);
      expect(res.body.user).toHaveProperty('email', 'logintest@test.com');
    });

    it('returns 401 for invalid token', async () => {
      await request(app)
        .get('/auth/validate')
        .set('Authorization', 'Bearer invalid-token-here')
        .expect(401);
    });

    it('returns 401 without token', async () => {
      await request(app)
        .get('/auth/validate')
        .expect(401);
    });
  });

  // ── GET /auth/me ─────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('returns user profile', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${meTestToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe('logintest@test.com');
      expect(res.body.user.name).toBe('Login Test');
      expect(res.body.user.role).toBe('user');
      expect(res.body.user).toHaveProperty('createdAt');
    });

    it('returns 401 without token', async () => {
      await request(app)
        .get('/auth/me')
        .expect(401);
    });
  });

  // ── POST /auth/change-password ────────────────────────────────────────

  describe('POST /auth/change-password', () => {
    it('returns 400 for wrong current password', async () => {
      await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${pwToken}`)
        .send({ currentPassword: 'WrongOld1', newPassword: 'NewPass1x' })
        .expect(400);
    });

    it('returns 400 for weak new password', async () => {
      await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${pwToken}`)
        .send({ currentPassword: 'OldPass1x', newPassword: 'weak' })
        .expect(400);
    });

    it('changes password successfully', async () => {
      await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${pwToken}`)
        .send({ currentPassword: 'OldPass1x', newPassword: 'NewPass1x' })
        .expect(200);
    });

    it('returns 400 without required fields', async () => {
      await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${pwToken}`)
        .send({})
        .expect(400);
    });
  });

  // ── Account lockout (LAST — burns through rate limit) ─────────────────

  describe('Account lockout', () => {
    it('locks account after 5 failed attempts', async () => {
      // Fail 4 times — should get remainingAttempts
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/auth/login')
          .send({ email: 'lockout@test.com', password: 'WrongPass1' });
        expect(res.status).toBe(401);
        expect(res.body.remainingAttempts).toBe(4 - i);
      }

      // 5th failure — should lock
      const lockRes = await request(app)
        .post('/auth/login')
        .send({ email: 'lockout@test.com', password: 'WrongPass1' })
        .expect(423);

      expect(lockRes.body.error).toMatch(/locked/i);

      // Subsequent attempt with correct password — still locked
      const blockedRes = await request(app)
        .post('/auth/login')
        .send({ email: 'lockout@test.com', password: 'TestPass1' })
        .expect(423);

      expect(blockedRes.body.error).toMatch(/locked/i);
    });

    it('unlocking via admin allows login again', async () => {
      // Get user ID
      const usersRes = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      const lockedUser = usersRes.body.users.find((u) => u.email === 'lockout@test.com');

      // Unlock
      await request(app)
        .post(`/api/admin/users/${lockedUser.id}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Login should work now
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'lockout@test.com', password: 'TestPass1' })
        .expect(200);

      expect(res.body).toHaveProperty('token');
    });
  });
});
