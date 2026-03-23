import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { SessionStore, validateInput } from '../middleware/auth';
import { logSecurityEvent } from '../middleware/security';
import { pool } from '../config/database';
import logger from '../lib/logger';
import type { AuthenticatedRequest } from '../types';

const router = express.Router();
const sessionStore = new SessionStore(pool);

// GET /api/admin/users — list all users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, role, created_at, updated_at, last_login,
              failed_login_attempts, locked_until, google_id
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({
      users: result.rows.map(row => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastLogin: row.last_login,
        failedLoginAttempts: row.failed_login_attempts,
        lockedUntil: row.locked_until,
        googleId: row.google_id,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error listing users');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users — create a new user
router.post('/users', async (req: Request, res: Response) => {
  try {
    const { email, name, password, role, googleId } = req.body;

    if (!email || !validateInput.email(email)) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    // Validate password if provided, but allow creating users with no password
    // (they can sign in via Google if their email matches)
    if (password && !validateInput.password(password)) {
      res.status(400).json({
        error: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number',
      });
      return;
    }

    if (role && !['admin', 'user'].includes(role)) {
      res.status(400).json({ error: 'Role must be "admin" or "user"' });
      return;
    }

    // Check for duplicate email
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const result = await pool.query(
      `INSERT INTO users (id, email, name, password_hash, role, google_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, email, name, role, google_id, created_at`,
      [email.toLowerCase(), name.trim(), passwordHash, role || 'user', googleId || null]
    );

    const currentUser = (req as AuthenticatedRequest).user;
    await logSecurityEvent(pool, {
      type: 'admin_user_created',
      method: 'POST',
      path: '/api/admin/users',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: currentUser?.userId,
      metadata: { targetEmail: email.toLowerCase(), targetRole: role || 'user' },
    });

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id — update user name, role, password, or googleId
router.patch('/users/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, password, googleId } = req.body;

    if (role !== undefined && !['admin', 'user'].includes(role)) {
      res.status(400).json({ error: 'Role must be "admin" or "user"' });
      return;
    }

    if (password !== undefined && !validateInput.password(password)) {
      res.status(400).json({
        error: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number',
      });
      return;
    }

    // Prevent removing your own admin role
    const currentUser = (req as AuthenticatedRequest).user;
    if (currentUser?.userId === id && role === 'user') {
      res.status(400).json({ error: 'Cannot remove your own admin role' });
      return;
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: (string | number | null)[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(validateInput.sanitizeString(name));
    }
    if (role !== undefined) {
      setClauses.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (password !== undefined) {
      const hash = await bcrypt.hash(password, 10);
      setClauses.push(`password_hash = $${paramIndex++}`);
      values.push(hash);
    }
    if (googleId !== undefined) {
      setClauses.push(`google_id = $${paramIndex++}`);
      values.push(googleId || null);
    }

    if (values.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, name, role, created_at, updated_at, last_login, google_id, failed_login_attempts, locked_until`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If role changed, revoke all sessions (force re-auth)
    if (role !== undefined) {
      await sessionStore.revokeAllUserSessions(id);
    }

    const metadata: Record<string, unknown> = { targetUserId: id };
    if (role !== undefined) metadata.newRole = role;
    if (password !== undefined) metadata.passwordChanged = true;
    if (googleId !== undefined) metadata.googleIdChanged = true;

    await logSecurityEvent(pool, {
      type: 'admin_user_updated',
      method: 'PATCH',
      path: `/api/admin/users/${id}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: currentUser?.userId,
      metadata,
    });

    res.json({ user: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id — delete a user
router.delete('/users/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;

    const currentUser = (req as AuthenticatedRequest).user;
    if (currentUser?.userId === id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    // Revoke all sessions and clean up related records first
    await sessionStore.revokeAllUserSessions(id);
    await pool.query('DELETE FROM security_logs WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [id]);

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await logSecurityEvent(pool, {
      type: 'admin_user_deleted',
      method: 'DELETE',
      path: `/api/admin/users/${id}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: currentUser?.userId,
      metadata: { targetUserId: id, targetEmail: result.rows[0]?.email },
    });

    res.json({ message: 'User deleted', id });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users/:id/unlock — manually unlock a locked account
router.post('/users/:id/unlock', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, name`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const currentUser = (req as AuthenticatedRequest).user;
    await logSecurityEvent(pool, {
      type: 'admin_account_unlocked',
      method: 'POST',
      path: `/api/admin/users/${id}/unlock`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: currentUser?.userId,
      metadata: { targetUserId: id },
    });

    res.json({ message: 'Account unlocked', user: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error unlocking user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
