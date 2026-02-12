import crypto from 'crypto';
import { Pool } from 'pg';
import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';
import type { SessionInfo } from '../types';

// Generate secure random tokens
const generateToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Enhanced session storage using database instead of in-memory
class SessionStore {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createSession(userId: string, userAgent: string | undefined, ip: string | undefined): Promise<string> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    try {
      await this.pool.query(
        `INSERT INTO sessions (id, user_id, token, user_agent, ip_address, expires_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
        [userId, token, userAgent, ip, expiresAt]
      );
      return token;
    } catch (error) {
      logger.error({ err: error }, 'Error creating session');
      throw error;
    }
  }

  async validateSession(token: string): Promise<SessionInfo | null> {
    try {
      const result = await this.pool.query(
        `SELECT s.*, u.email, u.name, u.role
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = $1 AND s.expires_at > NOW() AND s.revoked_at IS NULL`,
        [token]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const session = result.rows[0];

      // Update last accessed time
      await this.pool.query(
        'UPDATE sessions SET last_accessed_at = NOW() WHERE id = $1',
        [session.id]
      );

      return {
        userId: session.user_id,
        email: session.email,
        name: session.name,
        role: session.role,
        sessionId: session.id,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error validating session');
      return null;
    }
  }

  async revokeSession(token: string): Promise<boolean> {
    try {
      await this.pool.query(
        'UPDATE sessions SET revoked_at = NOW() WHERE token = $1',
        [token]
      );
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Error revoking session');
      return false;
    }
  }

  async revokeAllUserSessions(userId: string): Promise<boolean> {
    try {
      await this.pool.query(
        'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1',
        [userId]
      );
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Error revoking all user sessions');
      return false;
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.pool.query(
        'DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL'
      );
      logger.info({ count: result.rowCount }, 'Cleaned up expired sessions');
      return result.rowCount ?? 0;
    } catch (error) {
      logger.error({ err: error }, 'Error cleaning up sessions');
      return 0;
    }
  }
}

// Input validation utilities
const validateInput = {
  email: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  password: (password: string): boolean => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
  },

  sanitizeString: (str: string): string => {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '');
  },

  sanitizeHtml: (str: string): string => {
    if (typeof str !== 'string') return '';
    // Basic HTML sanitization - consider using a library like DOMPurify for production
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  },

  validateTaskTitle: (title: string): boolean => {
    const sanitized = validateInput.sanitizeString(title);
    return sanitized.length >= 1 && sanitized.length <= 255;
  },

  validateTaskDescription: (description: string): boolean => {
    const sanitized = validateInput.sanitizeString(description);
    return sanitized.length <= 1000;
  },

  validateMessage: (message: string): boolean => {
    const sanitized = validateInput.sanitizeHtml(message);
    return sanitized.length >= 1 && sanitized.length <= 2000;
  },
};

// CSRF protection
const csrfProtection = () => {
  const tokens = new Map<string, string>();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip CSRF for GET requests and authenticated API endpoints
    if (req.method === 'GET' || req.path.startsWith('/api/')) {
      next();
      return;
    }

    const csrfToken = req.headers['x-csrf-token'] as string | undefined;
    const sessionToken = (req.headers.authorization as string | undefined)?.replace('Bearer ', '');

    if (!csrfToken || !sessionToken) {
      res.status(403).json({ error: 'CSRF token missing' });
      return;
    }

    const storedToken = tokens.get(sessionToken);
    if (!storedToken || storedToken !== csrfToken) {
      res.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }

    next();
  };
};

// Rate limiting per user
const createUserRateLimit = (pool: Pool) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      next(); // Skip rate limiting for unauthenticated requests
      return;
    }

    const session = await new SessionStore(pool).validateSession(token);
    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    const userId = session.userId;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 100; // 100 requests per minute per user

    if (!requests.has(userId)) {
      requests.set(userId, { count: 0, resetTime: now + windowMs });
    }

    const userRequests = requests.get(userId)!;

    if (now > userRequests.resetTime) {
      userRequests.count = 0;
      userRequests.resetTime = now + windowMs;
    }

    userRequests.count++;

    if (userRequests.count > maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((userRequests.resetTime - now) / 1000)
      });
      return;
    }

    next();
  };
};

export {
  SessionStore,
  validateInput,
  csrfProtection,
  createUserRateLimit,
  generateToken,
};
