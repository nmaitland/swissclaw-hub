import * as crypto from 'crypto';
import { Pool } from 'pg';
import { User, Session } from '../types';

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

  async createSession(userId: string, userAgent?: string, ip?: string): Promise<string> {
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
      console.error('Error creating session:', error);
      throw error;
    }
  }

  async validateSession(token: string): Promise<{
    userId: string;
    email: string;
    name: string;
    role: string;
    sessionId: string;
  } | null> {
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
      console.error('Error validating session:', error);
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
      console.error('Error revoking session:', error);
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
      console.error('Error revoking all user sessions:', error);
      return false;
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.pool.query(
        'DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL'
      );
      console.log(`Cleaned up ${result.rowCount} expired sessions`);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
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

  sanitizeString: (str: unknown): string => {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '');
  },

  sanitizeHtml: (str: unknown): string => {
    if (typeof str !== 'string') return '';
    // Basic HTML sanitization - consider using a library like DOMPurify for production
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  },

  validateTaskTitle: (title: unknown): boolean => {
    const sanitized = validateInput.sanitizeString(title);
    return sanitized.length >= 1 && sanitized.length <= 255;
  },

  validateTaskDescription: (description: unknown): boolean => {
    const sanitized = validateInput.sanitizeString(description);
    return sanitized.length <= 1000;
  },

  validateMessage: (message: unknown): boolean => {
    const sanitized = validateInput.sanitizeHtml(message);
    return sanitized.length >= 1 && sanitized.length <= 2000;
  },
};

// CSRF protection
const csrfProtection = () => {
  const tokens = new Map<string, string>();

  return (req: any, res: any, next: any) => {
    // Skip CSRF for GET requests and authenticated API endpoints
    if (req.method === 'GET' || req.path.startsWith('/api/')) {
      return next();
    }

    const csrfToken = req.headers['x-csrf-token'] as string;
    const sessionToken = req.headers.authorization?.replace('Bearer ', '') as string;

    if (!csrfToken || !sessionToken) {
      return res.status(403).json({ error: 'CSRF token missing' });
    }

    const storedToken = tokens.get(sessionToken);
    if (!storedToken || storedToken !== csrfToken) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
  };
};

// Rate limiting per user
const createUserRateLimit = (pool: Pool) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '') as string;
    if (!token) {
      return next(); // Skip rate limiting for unauthenticated requests
    }

    const sessionStore = new SessionStore(pool);
    const session = await sessionStore.validateSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
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
      return res.status(429).json({ 
        error: 'Too many requests',
        retryAfter: Math.ceil((userRequests.resetTime - now) / 1000)
      });
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
