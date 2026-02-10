import express from 'express';
import bcrypt from 'bcrypt';
import { SessionStore } from '../middleware/auth';
import { validateInput } from '../middleware/auth';
import { authRateLimit, logSecurityEvent } from '../middleware/security';
import { pool } from '../config/database';
import { LoginRequest, LoginResponse } from '../types';

const router = express.Router();

// Initialize session store
const sessionStore = new SessionStore(pool);

// Get current user info
router.get('/me', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') as string;
    
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
    console.error('Session validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
