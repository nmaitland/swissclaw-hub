const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Auth Routes (real server)', () => {
  let adminToken;

  beforeAll(async () => {
    await resetTestDb();
    adminToken = await getAuthToken();
  });

  // ── POST /auth/login ─────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    beforeAll(async () => {
      // Create a test user via admin API
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'logintest@test.com', name: 'Login Test', password: 'TestPass1', role: 'user' });
    });

    it('returns token with valid credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'logintest@test.com', password: 'TestPass1' })
        .expect(200);

      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe('logintest@test.com');
      expect(res.body.user.role).toBe('user');
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

  // ── Account lockout ───────────────────────────────────────────────────

  describe('Account lockout', () => {
    beforeAll(async () => {
      // Create a user specifically for lockout testing
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'lockout@test.com', name: 'Lockout Test', password: 'TestPass1', role: 'user' });
    });

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

  // ── POST /auth/logout ────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('revokes the session token', async () => {
      // Login to get a token
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: 'logintest@test.com', password: 'TestPass1' });
      const token = loginRes.body.token;

      // Logout
      await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Token should no longer be valid
      await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${token}`)
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
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: 'logintest@test.com', password: 'TestPass1' });

      const res = await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
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
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: 'logintest@test.com', password: 'TestPass1' });

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
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
    let pwToken;

    beforeAll(async () => {
      // Create user for password change testing
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'pwchange@test.com', name: 'PW Change', password: 'OldPass1x', role: 'user' });

      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: 'pwchange@test.com', password: 'OldPass1x' });
      pwToken = loginRes.body.token;
    });

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

      // Can login with new password
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'pwchange@test.com', password: 'NewPass1x' })
        .expect(200);

      expect(res.body).toHaveProperty('token');
    });

    it('returns 400 without required fields', async () => {
      // Need a fresh token since password change revokes sessions
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: 'pwchange@test.com', password: 'NewPass1x' });

      await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .send({})
        .expect(400);
    });
  });
});
