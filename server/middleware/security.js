const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

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
  skip: (req) => {
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
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }
    next();
  };
};

// SQL injection prevention
const sanitizeQuery = (req, res, next) => {
  // Log suspicious query patterns
  const suspiciousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
    /(--|\/\*|\*\/|;|'|")/,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
  ];

  const checkSuspicious = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(obj[key])) {
            console.warn('Suspicious query pattern detected:', {
              ip: req.ip,
              userAgent: req.get('User-Agent'),
              path: req.path,
              field: key,
              value: obj[key],
            });
            return true;
          }
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (checkSuspicious(obj[key])) return true;
      }
    }
    return false;
  };

  if (checkSuspicious(req.body) || checkSuspicious(req.query) || checkSuspicious(req.params)) {
    return res.status(400).json({ error: 'Invalid request parameters' });
  }

  next();
};

// XSS protection middleware
const xssProtection = (req, res, next) => {
  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (typeof obj[key] === 'string') {
          // Basic XSS protection - consider using DOMPurify for production
          sanitized[key] = obj[key]
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
        } else if (typeof obj[key] === 'object') {
          sanitized[key] = sanitizeObject(obj[key]);
        } else {
          sanitized[key] = obj[key];
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
const auditLogger = (pool) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    // Store original res.json to intercept responses
    const originalJson = res.json;
    res.json = function(data) {
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
      
      return originalJson.call(this, data);
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

const logSecurityEvent = async (pool, event) => {
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
    console.error('Failed to log security event:', error);
  }
};

// Error handling for security-related errors
const securityErrorHandler = (err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.details,
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }

  // Log security errors
  console.error('Security error:', {
    error: err.message,
    stack: err.stack,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.path,
    method: req.method,
  });

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      error: 'Internal server error',
    });
  }

  next(err);
};

module.exports = {
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
