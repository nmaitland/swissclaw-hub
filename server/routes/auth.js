const express = require('express');
const bcrypt = require('bcrypt');
const { SessionStore, validateInput } = require('../middleware/auth');
const { authRateLimit, logSecurityEvent } = require('../middleware/security');
const { pool } = require('../config/database');
const logger = require('../lib/logger');

const router = express.Router();

// Initialize session store
const sessionStore = new SessionStore(pool);

// Login route
router.post('/login', authRateLimit, async (req, res) => {
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
      
      return res.status(400).json({ error: 'Email and password are required' });
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
      
      return res.status(400).json({ error: 'Invalid email format' });
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
      
      return res.status(401).json({ error: 'Invalid credentials' });
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
      
      return res.status(401).json({ error: 'Invalid credentials' });
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
      metadata: { error: error.message },
    });
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout route
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(400).json({ error: 'No token provided' });
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

// Validate session route
router.get('/validate', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const session = await sessionStore.validateSession(token);
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
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

// Get current user info
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const session = await sessionStore.validateSession(token);
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Get additional user info
    const userResult = await pool.query(
      'SELECT id, email, name, role, created_at, last_login FROM users WHERE id = $1',
      [session.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
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

// Change password (for production use)
router.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { currentPassword, newPassword } = req.body;

    if (!token || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!validateInput.password(newPassword)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number' 
      });
    }

    const session = await sessionStore.validateSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Get current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [session.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Verify current password
    if (user.password_hash) {
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
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

module.exports = router;
