const { validateInput, generateToken, csrfProtection } = require('../../server/middleware/auth');

describe('generateToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns unique tokens on each call', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});

describe('validateInput', () => {
  describe('email', () => {
    it('accepts valid emails', () => {
      expect(validateInput.email('user@example.com')).toBe(true);
      expect(validateInput.email('a.b@c.co')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(validateInput.email('')).toBe(false);
      expect(validateInput.email('not-an-email')).toBe(false);
      expect(validateInput.email('@missing.user')).toBe(false);
      expect(validateInput.email('user@')).toBe(false);
      expect(validateInput.email('user @example.com')).toBe(false);
    });
  });

  describe('password', () => {
    it('accepts valid passwords', () => {
      expect(validateInput.password('Password1')).toBe(true);
      expect(validateInput.password('MyP@ssw0rd')).toBe(true);
    });

    it('rejects short passwords', () => {
      expect(validateInput.password('Ab1')).toBe(false);
    });

    it('rejects passwords without uppercase', () => {
      expect(validateInput.password('password1')).toBe(false);
    });

    it('rejects passwords without lowercase', () => {
      expect(validateInput.password('PASSWORD1')).toBe(false);
    });

    it('rejects passwords without digits', () => {
      expect(validateInput.password('PasswordOnly')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('removes angle brackets', () => {
      expect(validateInput.sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
    });

    it('trims whitespace', () => {
      expect(validateInput.sanitizeString('  hello  ')).toBe('hello');
    });

    it('returns empty string for non-string input', () => {
      expect(validateInput.sanitizeString(null)).toBe('');
      expect(validateInput.sanitizeString(undefined)).toBe('');
      expect(validateInput.sanitizeString(123)).toBe('');
    });
  });

  describe('sanitizeHtml', () => {
    it('removes script tags', () => {
      expect(validateInput.sanitizeHtml('<script>alert(1)</script>')).not.toContain('<script');
    });

    it('removes iframe tags', () => {
      expect(validateInput.sanitizeHtml('<iframe src="evil.com"></iframe>')).not.toContain('<iframe');
    });

    it('removes javascript: protocol', () => {
      expect(validateInput.sanitizeHtml('javascript:alert(1)')).not.toContain('javascript:');
    });

    it('removes event handlers', () => {
      const input = '<div onload=alert(1)>';
      expect(validateInput.sanitizeHtml(input)).not.toMatch(/onload\s*=/i);
    });

    it('returns empty string for non-string input', () => {
      expect(validateInput.sanitizeHtml(null)).toBe('');
      expect(validateInput.sanitizeHtml(42)).toBe('');
    });
  });

  describe('validateTaskTitle', () => {
    it('accepts valid titles', () => {
      expect(validateInput.validateTaskTitle('My Task')).toBe(true);
      expect(validateInput.validateTaskTitle('x')).toBe(true);
    });

    it('rejects empty titles', () => {
      expect(validateInput.validateTaskTitle('')).toBe(false);
    });

    it('rejects titles over 255 chars', () => {
      expect(validateInput.validateTaskTitle('a'.repeat(256))).toBe(false);
    });
  });

  describe('validateTaskDescription', () => {
    it('accepts valid descriptions', () => {
      expect(validateInput.validateTaskDescription('A short desc')).toBe(true);
      expect(validateInput.validateTaskDescription('')).toBe(true);
    });

    it('rejects descriptions over 1000 chars', () => {
      expect(validateInput.validateTaskDescription('a'.repeat(1001))).toBe(false);
    });
  });

  describe('validateMessage', () => {
    it('accepts valid messages', () => {
      expect(validateInput.validateMessage('Hello world')).toBe(true);
    });

    it('rejects empty messages', () => {
      expect(validateInput.validateMessage('')).toBe(false);
    });

    it('rejects messages over 2000 chars', () => {
      expect(validateInput.validateMessage('a'.repeat(2001))).toBe(false);
    });
  });
});

describe('csrfProtection', () => {
  let middleware;
  let req;
  let res;
  let next;

  beforeEach(() => {
    middleware = csrfProtection();
    next = jest.fn();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('skips GET requests', () => {
    req = { method: 'GET', path: '/something' };
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('skips API paths', () => {
    req = { method: 'POST', path: '/api/something' };
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when CSRF token is missing', () => {
    req = {
      method: 'POST',
      path: '/auth/login',
      headers: { authorization: 'Bearer abc123' },
    };
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'CSRF token missing' });
  });

  it('returns 403 when session token is missing', () => {
    req = {
      method: 'POST',
      path: '/auth/login',
      headers: { 'x-csrf-token': 'some-token' },
    };
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'CSRF token missing' });
  });
});
