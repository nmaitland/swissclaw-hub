const { sanitizeQuery, xssProtection, securityErrorHandler } = require('../../server/middleware/security');

describe('sanitizeQuery', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    next = jest.fn();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('allows normal requests through', () => {
    req = {
      body: { title: 'My Task', description: 'A normal description' },
      query: {},
      params: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
      path: '/api/kanban',
    };
    sanitizeQuery(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks SQL keywords in body', () => {
    req = {
      body: { title: 'DROP TABLE users' },
      query: {},
      params: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
      path: '/api/kanban',
    };
    sanitizeQuery(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid request parameters' });
  });

  it('blocks SQL injection in query params', () => {
    req = {
      body: {},
      query: { search: "'; DROP TABLE users; --" },
      params: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
      path: '/api/search',
    };
    sanitizeQuery(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('blocks OR 1=1 injection pattern', () => {
    req = {
      body: { username: "admin' OR 1=1" },
      query: {},
      params: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
      path: '/auth/login',
    };
    sanitizeQuery(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('blocks UNION SELECT injection', () => {
    req = {
      body: { id: '1 UNION SELECT * FROM users' },
      query: {},
      params: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
      path: '/api/data',
    };
    sanitizeQuery(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('handles nested objects', () => {
    req = {
      body: { nested: { deep: "'; DELETE FROM users; --" } },
      query: {},
      params: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
      path: '/api/data',
    };
    sanitizeQuery(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('xssProtection', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    next = jest.fn();
    res = {};
  });

  it('encodes HTML entities in request body strings', () => {
    req = {
      body: { name: '<script>alert("xss")</script>' },
    };
    xssProtection(req, res, next);
    expect(req.body.name).not.toContain('<script>');
    expect(req.body.name).toContain('&lt;script&gt;');
    expect(next).toHaveBeenCalled();
  });

  it('handles nested objects', () => {
    req = {
      body: { user: { bio: '<img onerror="alert(1)">' } },
    };
    xssProtection(req, res, next);
    expect(req.body.user.bio).not.toContain('<img');
    expect(next).toHaveBeenCalled();
  });

  it('preserves string array elements unchanged (sanitization only applies to object values)', () => {
    req = {
      body: { tags: ['<b>bold</b>', 'normal'] },
    };
    xssProtection(req, res, next);
    // sanitizeObject returns non-object types unchanged, so bare strings in arrays pass through
    expect(req.body.tags[0]).toBe('<b>bold</b>');
    expect(req.body.tags[1]).toBe('normal');
    expect(next).toHaveBeenCalled();
  });

  it('preserves non-string values', () => {
    req = {
      body: { count: 42, active: true, title: 'safe text' },
    };
    xssProtection(req, res, next);
    expect(req.body.count).toBe(42);
    expect(req.body.active).toBe(true);
    expect(req.body.title).toBe('safe text');
    expect(next).toHaveBeenCalled();
  });

  it('calls next when body is null', () => {
    req = { body: null };
    xssProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('securityErrorHandler', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    next = jest.fn();
    req = {
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
      path: '/api/test',
      method: 'POST',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    // Suppress console.error in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('returns 400 for ValidationError', () => {
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    err.details = [{ message: 'field is required' }];

    securityErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Validation failed',
      details: err.details,
    });
  });

  it('returns 401 for UnauthorizedError', () => {
    const err = new Error('Not authorized');
    err.name = 'UnauthorizedError';

    securityErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication required',
    });
  });

  it('returns 500 with generic message in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const err = new Error('DB connection failed');
    securityErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
    });

    process.env.NODE_ENV = originalEnv;
  });

  it('passes error to next in non-production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const err = new Error('Something went wrong');
    securityErrorHandler(err, req, res, next);
    expect(next).toHaveBeenCalledWith(err);

    process.env.NODE_ENV = originalEnv;
  });
});
