import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import logger from '../lib/logger';
import type { SecurityEvent, AuthenticatedRequest } from '../types';

// Enhanced security headers configuration
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for development
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// General rate limiting (for unauthenticated requests)
const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Skip rate limiting for health checks and static files
    return req.path === '/health' || req.path.startsWith('/static');
  },
});

// Strict rate limiting for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
  },
  skipSuccessfulRequests: true,
});

// Input validation middleware
const validateRequest = (schema: { validate: (body: unknown) => { error?: { details: Array<{ path: string[]; message: string }> } } }) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
      return;
    }
    next();
  };
};

// SQL injection prevention
const sanitizeQuery = (req: Request, res: Response, next: NextFunction): void => {
  // Log suspicious query patterns
  const suspiciousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
    /(--|\/\*|\*\/|;|'|")/,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
  ];

  const checkSuspicious = (obj: Record<string, unknown>): boolean => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(obj[key] as string)) {
            logger.warn({
              ip: req.ip,
              userAgent: req.get('User-Agent'),
              path: req.path,
              field: key,
              value: obj[key],
            }, 'Suspicious query pattern detected');
            return true;
          }
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (checkSuspicious(obj[key] as Record<string, unknown>)) return true;
      }
    }
    return false;
  };

  if (checkSuspicious(req.body as Record<string, unknown>) ||
      checkSuspicious(req.query as Record<string, unknown>) ||
      checkSuspicious(req.params as Record<string, unknown>)) {
    res.status(400).json({ error: 'Invalid request parameters' });
    return;
  }

  next();
};

// XSS protection middleware
const xssProtection = (req: Request, res: Response, next: NextFunction): void => {
  const sanitizeObject = (obj: unknown): unknown => {
    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized: Record<string, unknown> = {};
    const record = obj as Record<string, unknown>;
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        if (typeof record[key] === 'string') {
          // Basic XSS protection - consider using DOMPurify for production
          sanitized[key] = (record[key] as string)
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
        } else if (typeof record[key] === 'object') {
          sanitized[key] = sanitizeObject(record[key]);
        } else {
          sanitized[key] = record[key];
        }
      }
    }
    return sanitized;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  next();
};

// Security audit logging
const auditLogger = (pool: Pool) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    // Store original res.json to intercept responses
    const originalJson = res.json.bind(res);
    res.json = function(data: unknown) {
      // Log the response
      logSecurityEvent(pool, {
        type: 'api_response',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.userId,
        duration: Date.now() - startTime,
        responseSize: JSON.stringify(data).length,
      });

      return originalJson(data);
    };

    // Log the request
    await logSecurityEvent(pool, {
      type: 'api_request',
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.userId,
    });

    next();
  };
};

const logSecurityEvent = async (pool: Pool, event: SecurityEvent): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO security_logs (id, type, method, path, status_code, ip_address, user_agent, user_id, duration, metadata, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        event.type,
        event.method,
        event.path,
        event.statusCode || null,
        event.ip,
        event.userAgent,
        event.userId || null,
        event.duration || null,
        JSON.stringify(event.metadata || {}),
      ]
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to log security event');
  }
};

// Error handling for security-related errors
interface SecurityError extends Error {
  details?: unknown;
}

const securityErrorHandler = (err: SecurityError, req: Request, res: Response, next: NextFunction): void => {
  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: 'Validation failed',
      details: err.details,
    });
    return;
  }

  if (err.name === 'UnauthorizedError') {
    res.status(401).json({
      error: 'Authentication required',
    });
    return;
  }

  // Log security errors
  logger.error({
    err,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.path,
    method: req.method,
  }, 'Security error');

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      error: 'Internal server error',
    });
    return;
  }

  next(err);
};

export {
  securityHeaders,
  generalRateLimit,
  authRateLimit,
  validateRequest,
  sanitizeQuery,
  xssProtection,
  auditLogger,
  logSecurityEvent,
  securityErrorHandler,
};
