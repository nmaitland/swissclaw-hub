import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { SessionStore, validateInput } from '../middleware/auth';
import { authRateLimit, logSecurityEvent } from '../middleware/security';
import { pool } from '../config/database';
import logger from '../lib/logger';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const router = express.Router();

// Initialize session store
const sessionStore = new SessionStore(pool);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth - Enhanced]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 token: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     email: { type: string }
 *                     name: { type: string }
 *                     role: { type: string }
 *       400:
 *         description: Missing or invalid credentials
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      await logSecurityEvent(pool, {
        type: 'auth_failure',
        method: 'POST',
        path: '/login',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: { reason: 'missing_credentials' },
      });

      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (!validateInput.email(email)) {
      await logSecurityEvent(pool, {
        type: 'auth_failure',
        method: 'POST',
        path: '/login',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: { reason: 'invalid_email_format', email },
      });

      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Find user in database
    const userResult = await pool.query(
      'SELECT id, email, name, password_hash, role, failed_login_attempts, locked_until FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      await logSecurityEvent(pool, {
        type: 'auth_failure',
        method: 'POST',
        path: '/login',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: { reason: 'user_not_found', email },
      });

      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = userResult.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until as string) > new Date()) {
      const remainingMs = new Date(user.locked_until as string).getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      await logSecurityEvent(pool, {
        type: 'auth_locked',
        method: 'POST',
        path: '/auth/login',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: user.id,
        metadata: { reason: 'account_locked', lockedUntil: user.locked_until },
      });
      res.status(423).json({
        error: `Account locked. Try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
      });
      return;
    }

    // For development, allow simple password authentication
    // In production, you should use proper password hashing
    let isValidPassword = false;

    if (process.env.NODE_ENV === 'development' && password === process.env.AUTH_PASSWORD) {
      isValidPassword = true;
    } else if (user.password_hash) {
      // Compare with hashed password
      isValidPassword = await bcrypt.compare(password, user.password_hash);
    }

    if (!isValidPassword) {
      const MAX_FAILED_ATTEMPTS = 5;
      const LOCKOUT_DURATION_MINUTES = 15;
      const newAttempts = ((user.failed_login_attempts as number) || 0) + 1;
      const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
        : null;

      await pool.query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3`,
        [newAttempts, lockedUntil, user.id]
      );

      await logSecurityEvent(pool, {
        type: shouldLock ? 'auth_lockout' : 'auth_failure',
        method: 'POST',
        path: '/auth/login',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: user.id,
        metadata: { reason: 'invalid_password', email, failedAttempts: newAttempts, locked: shouldLock },
      });

      if (shouldLock) {
        res.status(423).json({
          error: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in ${LOCKOUT_DURATION_MINUTES} minutes.`,
        });
      } else {
        res.status(401).json({
          error: 'Invalid credentials',
          remainingAttempts: MAX_FAILED_ATTEMPTS - newAttempts,
        });
      }
      return;
    }

    // Reset failed attempts on successful login
    if ((user.failed_login_attempts as number) > 0) {
      await pool.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
        [user.id]
      );
    }

    // Create session
    const token = await sessionStore.createSession(
      user.id,
      req.get('User-Agent'),
      req.ip
    );

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    await logSecurityEvent(pool, {
      type: 'auth_success',
      method: 'POST',
      path: '/login',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: user.id,
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Login error');
    await logSecurityEvent(pool, {
      type: 'auth_error',
      method: 'POST',
      path: '/login',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { error: (error as Error).message },
    });

    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth - Enhanced]
 *     summary: Logout and revoke session
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       400:
 *         description: No token provided
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(400).json({ error: 'No token provided' });
      return;
    }

    const session = await sessionStore.validateSession(token);
    if (session) {
      await sessionStore.revokeSession(token);

      await logSecurityEvent(pool, {
        type: 'auth_logout',
        method: 'POST',
        path: '/logout',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: session.userId,
      });
    }

    res.json({ message: 'Logout successful' });
  } catch (error) {
    logger.error({ err: error }, 'Logout error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /auth/validate:
 *   get:
 *     tags: [Auth - Enhanced]
 *     summary: Validate current session token
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Session is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid: { type: boolean }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     email: { type: string }
 *                     name: { type: string }
 *                     role: { type: string }
 *       401:
 *         description: Invalid or expired session
 */
router.get('/validate', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const session = await sessionStore.validateSession(token);

    if (!session) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    res.json({
      valid: true,
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Session validation error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth - Enhanced]
 *     summary: Get current user profile
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     email: { type: string }
 *                     name: { type: string }
 *                     role: { type: string }
 *                     createdAt: { type: string, format: date-time }
 *                     lastLogin: { type: string, format: date-time }
 *       401:
 *         description: Not authenticated
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const session = await sessionStore.validateSession(token);

    if (!session) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    // Get additional user info
    const userResult = await pool.query(
      'SELECT id, email, name, role, created_at, last_login FROM users WHERE id = $1',
      [session.userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.created_at,
        lastLogin: user.last_login,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Get user info error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Auth - Enhanced]
 *     summary: Change password
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8, description: "Must have 1 uppercase, 1 lowercase, 1 number" }
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid input or wrong current password
 *       401:
 *         description: Not authenticated
 */
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { currentPassword, newPassword } = req.body;

    if (!token || !currentPassword || !newPassword) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!validateInput.password(newPassword)) {
      res.status(400).json({
        error: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number'
      });
      return;
    }

    const session = await sessionStore.validateSession(token);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    // Get current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [session.userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];

    // Verify current password
    if (user.password_hash) {
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidPassword) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, session.userId]
    );

    // Revoke all other sessions for security
    await sessionStore.revokeAllUserSessions(session.userId);

    await logSecurityEvent(pool, {
      type: 'password_changed',
      method: 'POST',
      path: '/change-password',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: session.userId,
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Change password error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/google — Login with Google ID token
router.post('/google', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Google ID token is required' });
      return;
    }

    if (!googleClient || !GOOGLE_CLIENT_ID) {
      res.status(503).json({ error: 'Google authentication is not configured' });
      return;
    }

    // Verify the Google ID token
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      await logSecurityEvent(pool, {
        type: 'auth_failure',
        method: 'POST',
        path: '/auth/google',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: { reason: 'invalid_google_token' },
      });
      res.status(401).json({ error: 'Invalid Google token' });
      return;
    }

    if (!payload || !payload.sub || !payload.email) {
      res.status(401).json({ error: 'Invalid Google token payload' });
      return;
    }

    // Look up user by google_id or email
    const userResult = await pool.query(
      `SELECT id, email, name, role, google_id, failed_login_attempts, locked_until
       FROM users WHERE google_id = $1 OR email = $2`,
      [payload.sub, payload.email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      await logSecurityEvent(pool, {
        type: 'auth_failure',
        method: 'POST',
        path: '/auth/google',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: { reason: 'user_not_found', googleEmail: payload.email },
      });
      res.status(403).json({ error: 'Account not found — contact an admin' });
      return;
    }

    const user = userResult.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until as string) > new Date()) {
      const remainingMs = new Date(user.locked_until as string).getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      res.status(423).json({
        error: `Account locked. Try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
      });
      return;
    }

    // If user was matched by email but doesn't have google_id yet, associate it
    if (!user.google_id) {
      await pool.query(
        'UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2',
        [payload.sub, user.id]
      );
    }

    // Create session
    const token = await sessionStore.createSession(
      user.id,
      req.get('User-Agent'),
      req.ip
    );

    // Update last login and reset failed attempts
    await pool.query(
      'UPDATE users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );

    await logSecurityEvent(pool, {
      type: 'auth_success',
      method: 'POST',
      path: '/auth/google',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: user.id,
      metadata: { provider: 'google', googleEmail: payload.email },
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Google login error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
