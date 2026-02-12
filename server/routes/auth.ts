import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { SessionStore, validateInput } from '../middleware/auth';
import { authRateLimit, logSecurityEvent } from '../middleware/security';
import { pool } from '../config/database';
import logger from '../lib/logger';

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
      'SELECT id, email, name, password_hash, role FROM users WHERE email = $1',
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
      await logSecurityEvent(pool, {
        type: 'auth_failure',
        method: 'POST',
        path: '/login',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: user.id,
        metadata: { reason: 'invalid_password', email },
      });

      res.status(401).json({ error: 'Invalid credentials' });
      return;
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

export default router;
