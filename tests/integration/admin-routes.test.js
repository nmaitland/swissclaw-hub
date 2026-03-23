const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

describe('Admin Routes (real server)', () => {
  let adminToken;
  const ADMIN_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  beforeAll(async () => {
    await resetTestDb();
    adminToken = await getAuthToken();
  });

  // ── GET /api/admin/users ──────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('returns a list of users for admin', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeGreaterThan(0);

      const user = res.body.users[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('failedLoginAttempts');
    });

    it('returns 401 without auth token', async () => {
      await request(app)
        .get('/api/admin/users')
        .expect(401);
    });
  });

  // ── POST /api/admin/users ─────────────────────────────────────────────

  describe('POST /api/admin/users', () => {
    it('creates a new user with valid data', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@test.com',
          name: 'New User',
          password: 'TestPass1',
          role: 'user',
        })
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe('newuser@test.com');
      expect(res.body.user.name).toBe('New User');
      expect(res.body.user.role).toBe('user');
    });

    it('creates a user without password (Google-only)', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'googleonly@test.com',
          name: 'Google User',
          role: 'user',
        })
        .expect(201);

      expect(res.body.user.email).toBe('googleonly@test.com');
    });

    it('returns 409 for duplicate email', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@test.com',
          name: 'Duplicate',
          password: 'TestPass1',
        })
        .expect(409);

      expect(res.body.error).toMatch(/already registered/i);
    });

    it('returns 400 for invalid email', async () => {
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'not-an-email', name: 'Test', password: 'TestPass1' })
        .expect(400);
    });

    it('returns 400 for missing name', async () => {
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'noname@test.com', password: 'TestPass1' })
        .expect(400);
    });

    it('returns 400 for weak password', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'weakpw@test.com', name: 'Test', password: 'weak' })
        .expect(400);

      expect(res.body.error).toMatch(/8 characters/);
    });

    it('returns 400 for invalid role', async () => {
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'badrole@test.com', name: 'Test', password: 'TestPass1', role: 'superadmin' })
        .expect(400);
    });
  });

  // ── PATCH /api/admin/users/:id ────────────────────────────────────────

  describe('PATCH /api/admin/users/:id', () => {
    let testUserId;

    beforeAll(async () => {
      // Create a user to patch
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'patchme@test.com', name: 'Patch Me', password: 'TestPass1' });
      testUserId = res.body.user.id;
    });

    it('updates user name', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.user.name).toBe('Updated Name');
    });

    it('updates user role', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' })
        .expect(200);

      expect(res.body.user.role).toBe('admin');
    });

    it('updates user password', async () => {
      await request(app)
        .patch(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'NewPass123' })
        .expect(200);
    });

    it('returns 400 for weak password', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'weak' })
        .expect(400);

      expect(res.body.error).toMatch(/8 characters/);
    });

    it('returns 400 for invalid role', async () => {
      await request(app)
        .patch(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'superadmin' })
        .expect(400);
    });

    it('returns 400 when no fields provided', async () => {
      await request(app)
        .patch(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('prevents admin from removing own admin role', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${ADMIN_USER_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'user' })
        .expect(400);

      expect(res.body.error).toMatch(/own admin role/);
    });

    it('returns 404 for non-existent user', async () => {
      await request(app)
        .patch('/api/admin/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  // ── POST /api/admin/users/:id/unlock ──────────────────────────────────

  describe('POST /api/admin/users/:id/unlock', () => {
    let lockedUserId;

    beforeAll(async () => {
      // Create a user that we'll treat as locked
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'locked@test.com', name: 'Locked User', password: 'TestPass1' });
      lockedUserId = res.body.user.id;
    });

    it('unlocks a user account', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${lockedUserId}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toMatch(/unlocked/i);
      expect(res.body.user).toHaveProperty('email', 'locked@test.com');
    });

    it('returns 404 for non-existent user', async () => {
      await request(app)
        .post('/api/admin/users/00000000-0000-0000-0000-000000000000/unlock')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── DELETE /api/admin/users/:id ───────────────────────────────────────

  describe('DELETE /api/admin/users/:id', () => {
    let deleteUserId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'deleteme@test.com', name: 'Delete Me', password: 'TestPass1' });
      deleteUserId = res.body.user.id;
    });

    it('prevents admin from deleting own account', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${ADMIN_USER_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.error).toMatch(/own account/);
    });

    it('deletes a user', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${deleteUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toMatch(/deleted/i);
      expect(res.body.id).toBe(deleteUserId);
    });

    it('returns 404 for already deleted user', async () => {
      await request(app)
        .delete(`/api/admin/users/${deleteUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── Role enforcement ─────────────────────────────────────────────────

  describe('Role enforcement', () => {
    let regularUserToken;

    beforeAll(async () => {
      // Create a non-admin user and get their token
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'regular@test.com', name: 'Regular', password: 'TestPass1', role: 'user' });

      // Login as the regular user via /auth/login
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: 'regular@test.com', password: 'TestPass1' });
      regularUserToken = loginRes.body.token;
    });

    it('returns 403 for non-admin on GET /api/admin/users', async () => {
      await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);
    });

    it('returns 403 for non-admin on POST /api/admin/users', async () => {
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({ email: 'hack@test.com', name: 'Hacker', password: 'TestPass1' })
        .expect(403);
    });

    it('returns 403 for non-admin on DELETE /api/admin/users/:id', async () => {
      await request(app)
        .delete(`/api/admin/users/${ADMIN_USER_ID}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);
    });
  });
});
