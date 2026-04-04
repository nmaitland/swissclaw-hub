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
      // Combined query: validate session AND update last_accessed_at in one round-trip
      const result = await this.pool.query(
        `WITH updated AS (
          UPDATE sessions SET last_accessed_at = NOW()
          WHERE token = $1 AND expires_at > NOW() AND revoked_at IS NULL
          RETURNING id, user_id, token, expires_at, created_at, last_accessed_at
        )
        SELECT u.email, u.name, u.role, updated.*
        FROM updated
        JOIN users u ON updated.user_id = u.id`,
        [token]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const session = result.rows[0];
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
    if (typeof email !== 'string') return false;
    const value = email.trim();

    // Conservative parser to avoid regex DoS patterns.
    if (!value || value.length > 254 || value.includes(' ')) return false;

    const atIndex = value.indexOf('@');
    if (atIndex <= 0 || atIndex !== value.lastIndexOf('@') || atIndex === value.length - 1) {
      return false;
    }

    const localPart = value.slice(0, atIndex);
    const domainPart = value.slice(atIndex + 1);
    if (!localPart || !domainPart || domainPart.startsWith('.') || domainPart.endsWith('.')) {
      return false;
    }

    if (!domainPart.includes('.')) return false;

    const labels = domainPart.split('.');
    return labels.every((label) => label.length > 0);
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

  validateTaskTitle: (title: string): boolean => {
    const sanitized = validateInput.sanitizeString(title);
    return sanitized.length >= 1 && sanitized.length <= 255;
  },

  validateTaskDescription: (description: string): boolean => {
    const sanitized = validateInput.sanitizeString(description);
    return sanitized.length <= 1000;
  },

  validateMessage: (message: string): boolean => {
    const sanitized = validateInput.sanitizeString(message);
    return sanitized.length >= 1 && sanitized.length <= 2000;
  },
};

// CSRF protection — double-submit cookie pattern.
// The server sets a non-httpOnly CSRF cookie on login. The browser JS reads
// it and sends it back as the X-CSRF-Token header. An attacker on a different
// origin cannot read the cookie (SameSite=Strict) so they cannot forge the
// header. We only enforce CSRF when the request is authenticated via cookies,
// not Bearer tokens (MCP/scripts don't use cookies, so CSRF doesn't apply).
import { CSRF_COOKIE, AUTH_COOKIE } from '../lib/cookies';

// Auth endpoints are pre-authentication — CSRF does not apply.
const CSRF_EXEMPT_PATHS = new Set(['/api/login', '/auth/login', '/auth/google', '/auth/refresh']);

const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Safe methods don't need CSRF protection
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  // Auth endpoints are exempt: you're not yet logged in, so there's no
  // authenticated session to protect. Also prevents a stale hub_auth cookie
  // (httpOnly, JS can't clear it) from triggering CSRF enforcement on login.
  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  // Only enforce CSRF for cookie-authenticated requests.
  // If the request uses a Bearer token, CSRF is not applicable.
  const hasBearerToken = req.headers.authorization?.startsWith('Bearer ');
  const hasAuthCookie = Boolean(req.cookies?.[AUTH_COOKIE]);

  if (hasBearerToken || !hasAuthCookie) {
    next();
    return;
  }

  // Double-submit check: cookie value must match header value
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: 'CSRF token missing or invalid' });
    return;
  }

  next();
};

// Role-based authorization middleware factory
// Must be used AFTER requireAuth has attached req.user
const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: { role: string } }).user;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

// Refresh tokens: long-lived (30 days), single-use rotation
class RefreshTokenStore {
  private pool: Pool;
  private readonly EXPIRY_DAYS = 30;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createRefreshToken(userId: string): Promise<string> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + this.EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await this.pool.query(
      `INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
      [userId, token, expiresAt]
    );
    return token;
  }

  // Atomically revoke the old token and issue a new one (rotation).
  // Returns null if the token is invalid/expired/already revoked.
  async validateAndRotate(token: string): Promise<{ userId: string; newRefreshToken: string } | null> {
    try {
      const result = await this.pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE token = $1 AND expires_at > NOW() AND revoked_at IS NULL
         RETURNING user_id`,
        [token]
      );
      if (result.rows.length === 0) return null;

      const userId = result.rows[0].user_id as string;
      const newRefreshToken = await this.createRefreshToken(userId);
      return { userId, newRefreshToken };
    } catch (error) {
      logger.error({ err: error }, 'Error rotating refresh token');
      return null;
    }
  }

  async revokeToken(token: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1',
      [token]
    );
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1',
      [userId]
    );
  }

  async cleanupExpired(): Promise<void> {
    await this.pool.query(
      'DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked_at IS NOT NULL'
    );
  }
}

export {
  SessionStore,
  RefreshTokenStore,
  validateInput,
  csrfProtection,
  generateToken,
  requireRole,
};
