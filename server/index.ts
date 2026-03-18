import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { Pool, PoolClient } from 'pg';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';
import logger from './lib/logger';
import { asyncHandler, errorHandler } from './lib/errors';
import { authRateLimit, logSecurityEvent } from './middleware/security';
import { SessionStore } from './middleware/auth';
import { pool } from './config/database';
import type { ChatMessageData, RateLimitEntry, BuildInfo, SessionInfo, KanbanTaskRow } from './types';
import authRouter from './routes/auth';

// Sparse ordering constants
const POSITION_GAP = 1000000n; // 1 million as BigInt
const REBALANCE_THRESHOLD = 100n; // Rebalance when gap < 100

// Helper functions for sparse ordering
async function calculateNewPosition(
  pool: Pool | PoolClient,
  columnId: number,
  targetTaskId?: number,
  insertAfter?: boolean
): Promise<bigint> {
  if (!targetTaskId) {
    // No target - place at end
    const result = await pool.query(
      'SELECT MAX(position) as max_pos FROM kanban_tasks WHERE column_id = $1',
      [columnId]
    );
    const maxPos = result.rows[0]?.max_pos || 0n;
    return BigInt(maxPos) + POSITION_GAP;
  }

  // Get positions of target and adjacent tasks
  const result = await pool.query(`
    SELECT
      (SELECT position FROM kanban_tasks WHERE id = $1) as target_pos,
      (SELECT position FROM kanban_tasks WHERE column_id = $2 AND position < (SELECT position FROM kanban_tasks WHERE id = $1) ORDER BY position DESC LIMIT 1) as prev_pos,
      (SELECT position FROM kanban_tasks WHERE column_id = $2 AND position > (SELECT position FROM kanban_tasks WHERE id = $1) ORDER BY position ASC LIMIT 1) as next_pos
  `, [targetTaskId, columnId]);

  const targetPos = BigInt(result.rows[0]?.target_pos || 0n);
  const prevPos = result.rows[0]?.prev_pos !== null ? BigInt(result.rows[0].prev_pos) : null;
  const nextPos = result.rows[0]?.next_pos !== null ? BigInt(result.rows[0].next_pos) : null;

  if (insertAfter) {
    // Insert after target task
    if (nextPos !== null) {
      // There's a task after the target
      return (targetPos + nextPos) / 2n;
    } else {
      // Target is last task
      return targetPos + POSITION_GAP;
    }
  } else {
    // Insert before target task
    if (prevPos !== null) {
      // There's a task before the target
      return (prevPos + targetPos) / 2n;
    } else {
      // Target is first task
      return targetPos / 2n;
    }
  }
}

async function checkAndRebalanceIfNeeded(pool: Pool | PoolClient, columnId: number): Promise<boolean> {
  // Check if any adjacent gap is too small
  const result = await pool.query(`
    WITH ordered_tasks AS (
      SELECT position, LAG(position) OVER (ORDER BY position) as prev_position
      FROM kanban_tasks
      WHERE column_id = $1
      ORDER BY position
    )
    SELECT EXISTS (
      SELECT 1 FROM ordered_tasks
      WHERE prev_position IS NOT NULL AND (position - prev_position) < $2
    ) as needs_rebalance
  `, [columnId, REBALANCE_THRESHOLD]);

  const needsRebalance = result.rows[0]?.needs_rebalance || false;
  
  if (needsRebalance) {
    await pool.query('SELECT rebalance_column_positions($1)', [columnId]);
    return true;
  }
  
  return false;
}

const app = express();
const httpServer = createServer(app);

// Security: Session-based authentication
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;

if (process.env.NODE_ENV === 'production') {
  if (!AUTH_PASSWORD) {
    throw new Error('AUTH_PASSWORD must be set in production');
  }
}

// Simple session store (in-memory, cleared on restart) - kept for backward compatibility during transition
const sessions = new Set<string>();

// Database-backed session store
const sessionStore = new SessionStore(pool);

// Auth middleware - uses database-backed sessions
const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Public endpoints that don't require auth
  // When mounted at /api, req.path is relative (e.g., /kanban not /api/kanban)
  const publicApiPaths = ['/login', '/build'];
  const publicRootPaths = ['/health', '/login'];

  if (publicApiPaths.includes(req.path) || publicRootPaths.includes(req.path)) {
    next();
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Authentication required', loginUrl: '/login' });
    return;
  }

  // First check database-backed sessions
  const session = await sessionStore.validateSession(token);
  if (session) {
    // Attach user info to request (using type assertion since we extended Request)
    (req as Request & { user?: SessionInfo }).user = session;
    next();
    return;
  }

  // Fall back to in-memory sessions (for backward compatibility during transition)
  if (sessions.has(token)) {
    next();
    return;
  }

  res.status(401).json({ error: 'Authentication required', loginUrl: '/login' });
};

// Serve login page (defined before body parser, uses raw HTML)
app.get('/login', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <title>Swissclaw Hub - Login</title>
      <style>
        :root {
          color-scheme: dark;
        }

        body {
          margin: 0;
          min-height: 100svh;
          padding: clamp(1rem, 3.5vw, 2rem);
          box-sizing: border-box;
          display: grid;
          place-items: center;
          font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
          background:
            radial-gradient(1100px 520px at 8% 8%, rgba(255, 69, 0, 0.2), transparent 60%),
            radial-gradient(900px 500px at 95% 95%, rgba(56, 189, 248, 0.14), transparent 60%),
            linear-gradient(140deg, #080910 0%, #14182a 55%, #0b0d15 100%);
          color: #e5e7eb;
        }

        .login-shell {
          width: min(28rem, 100%);
        }

        .login-card {
          border-radius: 18px;
          border: 1px solid rgba(255, 69, 0, 0.35);
          background: linear-gradient(160deg, rgba(12, 16, 31, 0.95), rgba(24, 20, 36, 0.92));
          box-shadow: 0 22px 52px rgba(0, 0, 0, 0.42);
          overflow: hidden;
        }

        .login-head {
          padding: 1.15rem 1.15rem 1rem 1.15rem;
          border-bottom: 1px solid rgba(255, 69, 0, 0.22);
          background: linear-gradient(180deg, rgba(255, 69, 0, 0.16), rgba(255, 69, 0, 0.06));
        }

        .login-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #ffba98;
          background: rgba(0, 0, 0, 0.24);
          border: 1px solid rgba(255, 69, 0, 0.25);
          border-radius: 999px;
          padding: 0.25rem 0.55rem;
        }

        h1 {
          margin: 0.75rem 0 0.2rem 0;
          color: #ff4500;
          font-size: clamp(1.3rem, 5.2vw, 1.65rem);
          line-height: 1.2;
        }

        .login-subtitle {
          margin: 0;
          color: #b0b9cb;
          font-size: 0.93rem;
        }

        .login-form {
          padding: 1rem 1.15rem 1.15rem 1.15rem;
        }

        .field-group {
          margin-bottom: 0.9rem;
        }

        label {
          display: block;
          margin-bottom: 0.38rem;
          font-size: 0.82rem;
          color: #c3cada;
          letter-spacing: 0.01em;
        }

        input {
          width: 100%;
          padding: 0.72rem 0.78rem;
          border: 1px solid rgba(255, 69, 0, 0.28);
          border-radius: 10px;
          background: rgba(4, 8, 20, 0.72);
          color: #e5e7eb;
          font-size: 1rem;
          box-sizing: border-box;
        }

        input::placeholder {
          color: #79849c;
        }

        input:focus {
          outline: none;
          border-color: #ff6b35;
          box-shadow: 0 0 0 2px rgba(255, 69, 0, 0.15);
        }

        button {
          width: 100%;
          margin-top: 0.25rem;
          padding: 0.78rem;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #ff4500, #ff6b35);
          color: white;
          font-size: 0.98rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: transform 0.16s ease, filter 0.16s ease, opacity 0.16s ease;
        }

        button:hover {
          transform: translateY(-1px);
          filter: brightness(1.06);
        }

        button:disabled {
          opacity: 0.72;
          cursor: not-allowed;
          transform: none;
        }

        .login-helper {
          margin-top: 0.75rem;
          font-size: 0.78rem;
          color: #96a0b6;
          line-height: 1.35;
        }

        .error {
          margin-top: 0.72rem;
          min-height: 1.15rem;
          font-size: 0.84rem;
          color: #ff8585;
        }

        .login-footer {
          margin: 0.7rem 0 0 0;
          text-align: center;
          color: #78839a;
          font-size: 0.76rem;
        }

        @media (max-width: 460px) {
          .login-head {
            padding: 1rem 0.95rem 0.88rem 0.95rem;
          }

          .login-form {
            padding: 0.92rem 0.95rem 1rem 0.95rem;
          }
        }
      </style>
    </head>
    <body>
      <div class="login-shell">
        <section class="login-card">
          <div class="login-head">
            <div class="login-badge"><span>\u{1F980}</span><span>Swissclaw Hub</span></div>
            <h1>Welcome back</h1>
            <p class="login-subtitle">Sign in to continue to your shared workspace.</p>
          </div>

          <form id="loginForm" class="login-form" novalidate>
            <div class="field-group">
              <label for="username">Username</label>
              <input type="text" id="username" placeholder="testuser" autocomplete="username" required />
            </div>

            <div class="field-group">
              <label for="password">Password</label>
              <input type="password" id="password" placeholder="Enter your password" autocomplete="current-password" required />
            </div>

            <button type="submit" id="submitBtn">Log In</button>
            <div id="error" class="error" role="status" aria-live="polite"></div>
            <p class="login-helper">Use your existing Swissclaw Hub credentials. Session starts immediately after successful login.</p>
          </form>
        </section>
        <p class="login-footer">Secure session auth \u2022 Swissclaw Hub</p>
      </div>
      <script>
        const form = document.getElementById('loginForm');
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const errorEl = document.getElementById('error');
        const submitBtn = document.getElementById('submitBtn');

        form.onsubmit = async (e) => {
          e.preventDefault();
          const username = usernameInput.value.trim();
          const password = passwordInput.value;

          if (!username || !password) {
            errorEl.textContent = 'Please enter both username and password.';
            return;
          }

          errorEl.textContent = '';
          submitBtn.disabled = true;
          submitBtn.textContent = 'Signing in...';

          try {
            const res = await fetch('/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (res.ok && data.token) {
              localStorage.setItem('authToken', data.token);
              window.location.href = '/';
              return;
            }

            errorEl.textContent = data && data.error ? data.error : 'Invalid credentials';
          } catch (err) {
            errorEl.textContent = 'Unable to reach the server. Please try again.';
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Log In';
          }
        };
      </script>
    </body>
    </html>
  `);
});

// Security: Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later'
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});


// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(limiter);

const apiLoginRateLimit =
  process.env.NODE_ENV === 'test'
    ? (_req: Request, _res: Response, next: NextFunction): void => next()
    : authRateLimit;

// API Documentation — Swagger UI (no auth required in dev/test, disabled in production)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Swissclaw Hub API Docs',
  }));
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.json(swaggerSpec);
  });
}

/**
 * @swagger
 * /api/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with username/password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 success: { type: boolean }
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/login', apiLoginRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    await logSecurityEvent(pool, {
      type: 'auth_failure',
      method: 'POST',
      path: '/api/login',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { reason: 'missing_credentials' },
    });
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  // Look up user by username (name) or email
  const userResult = await pool.query(
    `SELECT id, email, name, password_hash, role FROM users
     WHERE name = $1 OR email = $1`,
    [username]
  );

  if (userResult.rows.length === 0) {
    // Fall back to env-based auth for backward compatibility
    if (AUTH_PASSWORD && username === AUTH_USERNAME && password === AUTH_PASSWORD) {
      const token = randomBytes(32).toString('hex');
      sessions.add(token);
      await logSecurityEvent(pool, {
        type: 'auth_success',
        method: 'POST',
        path: '/api/login',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: { provider: 'env_fallback' },
      });
      res.json({ token, success: true });
      return;
    }
    await logSecurityEvent(pool, {
      type: 'auth_failure',
      method: 'POST',
      path: '/api/login',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { reason: 'user_not_found' },
    });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const user = userResult.rows[0];

  // Check password
  let isValidPassword = false;
  if (user.password_hash) {
    isValidPassword = await bcrypt.compare(password, user.password_hash);
  } else if (AUTH_PASSWORD && password === AUTH_PASSWORD) {
    // Allow fallback to env password if no hash set
    isValidPassword = true;
  }

  if (!isValidPassword) {
    await logSecurityEvent(pool, {
      type: 'auth_failure',
      method: 'POST',
      path: '/api/login',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: user.id,
      metadata: { reason: 'invalid_password' },
    });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Create database session
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
    path: '/api/login',
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: user.id,
    metadata: { provider: 'database_session' },
  });

  res.json({ token, success: true });
}));

const hasServiceAccess = async (req: Request): Promise<boolean> => {
  const authHeader = req.headers.authorization;
  const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (bearerToken) {
    const session = await sessionStore.validateSession(bearerToken);
    if (session || sessions.has(bearerToken)) {
      return true;
    }
  }

  return false;
};

type ModelUsageCostType = 'paid' | 'free_tier_potential';

interface ModelUsageCostBucket {
  type: ModelUsageCostType;
  amount: number;
}

interface ModelUsageModelSnapshot {
  model: string;
  provider: string | null;
  source: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  costs: ModelUsageCostBucket[];
}

interface ModelUsageTotalsSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  costs: ModelUsageCostBucket[];
}

interface ModelUsageSnapshot {
  usageDate: string;
  updatedAt: string;
  models: ModelUsageModelSnapshot[];
  totals: ModelUsageTotalsSnapshot;
}

const COST_TYPES: readonly ModelUsageCostType[] = ['paid', 'free_tier_potential'];

const parseNonNegativeNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return null;
  }
  return value;
};

const parseIsoDateOnly = (value: unknown): string | null => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
};

const parseIsoDateTime = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeCostBuckets = (raw: unknown): ModelUsageCostBucket[] | null => {
  if (!Array.isArray(raw)) return null;
  const buckets: ModelUsageCostBucket[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.type !== 'string' || !COST_TYPES.includes(item.type as ModelUsageCostType)) {
      return null;
    }
    const amount = parseNonNegativeNumber(item.amount);
    if (amount === null) return null;
    buckets.push({ type: item.type as ModelUsageCostType, amount });
  }
  return buckets;
};

const normalizeModelUsageModels = (rawModels: unknown): ModelUsageModelSnapshot[] | null => {
  if (!Array.isArray(rawModels)) return null;

  const normalized: ModelUsageModelSnapshot[] = [];
  for (const rawModel of rawModels) {
    if (!rawModel || typeof rawModel !== 'object') return null;
    const model = rawModel as Record<string, unknown>;
    if (typeof model.model !== 'string' || model.model.trim().length === 0) return null;

    const inputTokens = parseNonNegativeNumber(model.inputTokens);
    const outputTokens = parseNonNegativeNumber(model.outputTokens);
    const requestCount = parseNonNegativeNumber(model.requestCount);
    const costs = normalizeCostBuckets(model.costs);

    if (inputTokens === null || outputTokens === null || requestCount === null || costs === null) {
      return null;
    }

    const provider = typeof model.provider === 'string' && model.provider.trim() !== ''
      ? sanitizeString(model.provider)
      : null;
    const source = typeof model.source === 'string' && model.source.trim() !== ''
      ? sanitizeString(model.source)
      : null;

    normalized.push({
      model: sanitizeString(model.model),
      provider,
      source,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      requestCount,
      costs,
    });
  }

  return normalized;
};

const calculateModelUsageTotals = (models: ModelUsageModelSnapshot[]): ModelUsageTotalsSnapshot => {
  const costMap = new Map<ModelUsageCostType, number>([
    ['paid', 0],
    ['free_tier_potential', 0],
  ]);

  let inputTokens = 0;
  let outputTokens = 0;
  let requestCount = 0;

  for (const model of models) {
    inputTokens += model.inputTokens;
    outputTokens += model.outputTokens;
    requestCount += model.requestCount;
    for (const cost of model.costs) {
      costMap.set(cost.type, (costMap.get(cost.type) || 0) + cost.amount);
    }
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    requestCount,
    costs: COST_TYPES.map((type) => ({ type, amount: costMap.get(type) || 0 })),
  };
};

const buildModelUsageSnapshot = (row: Record<string, unknown>): ModelUsageSnapshot | null => {
  const usageDate = parseIsoDateOnly(row.usage_date);
  const updatedAt = parseIsoDateTime(
    row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  );
  const models = normalizeModelUsageModels(row.models_json);

  if (!usageDate || !updatedAt || models === null) {
    return null;
  }

  return {
    usageDate,
    updatedAt,
    models,
    totals: calculateModelUsageTotals(models),
  };
};

/**
 * @swagger
 * /api/service/activities:
 *   post:
 *     tags: [Activities]
 *     summary: Create activity (authenticated)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, description]
 *             properties:
 *               type: { type: string, maxLength: 50 }
 *               description: { type: string, maxLength: 500 }
 *               sender: { type: string, maxLength: 50 }
 *               metadata: { type: object }
 *     responses:
 *       200:
 *         description: Activity created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Activity'
 *       401:
 *         description: Authentication required
 */
app.post('/api/service/activities', asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasServiceAccess(req))) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { type, description, metadata, sender } = req.body;

  if (!type || !description) {
    res.status(400).json({ error: 'Type and description required' });
    return;
  }
  if (sender !== undefined && (typeof sender !== 'string' || sender.length > 50)) {
    res.status(400).json({ error: 'Invalid sender' });
    return;
  }

  const safeSender = sender ? sanitizeString(sender) : null;

  const result = await pool.query(
    'INSERT INTO activities (type, description, sender, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
    [sanitizeString(type), sanitizeString(description), safeSender, JSON.stringify(metadata || {})]
  );

  io.emit('activity', result.rows[0]);
  res.json(result.rows[0]);
}));

/**
 * @swagger
 * /api/service/messages:
 *   post:
 *     tags: [Chat]
 *     summary: Send a chat message (authenticated)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sender, content]
 *             properties:
 *               sender: { type: string, maxLength: 50 }
 *               content: { type: string, maxLength: 5000 }
 *     responses:
 *       200:
 *         description: Message created and broadcast
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       401:
 *         description: Authentication required
 *       400:
 *         description: Invalid input
 */
app.post('/api/service/messages', asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasServiceAccess(req))) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { sender, content } = req.body;

  if (!sender || typeof sender !== 'string' || sender.length > 50) {
    res.status(400).json({ error: 'Invalid sender' });
    return;
  }
  if (!content || typeof content !== 'string' || content.length > 5000) {
    res.status(400).json({ error: 'Invalid content' });
    return;
  }

  const safeSender = sanitizeString(sender);
  const safeContent = sanitizeString(content);

  const result = await pool.query(
    'INSERT INTO messages (sender, content) VALUES ($1, $2) RETURNING *',
    [safeSender, safeContent]
  );

  // Broadcast to all connected Socket.io clients
  io.emit('message', result.rows[0]);

  // Also create an activity for the feed
  await pool.query(
    'INSERT INTO activities (type, description, sender, metadata) VALUES ($1, $2, $3, $4)',
    ['chat', safeContent, safeSender, JSON.stringify({ sender: safeSender, messageId: result.rows[0].id })]
  );

  res.json(result.rows[0]);
}));

/**
 * @swagger
 * /api/service/model-usage:
 *   put:
 *     tags: [Model Usage]
 *     summary: Upsert daily model usage snapshot (authenticated)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [usageDate, updatedAt, models]
 *             properties:
 *               usageDate: { type: string, format: date }
 *               updatedAt: { type: string, format: date-time }
 *               models:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [model, inputTokens, outputTokens, requestCount, costs]
 *                   properties:
 *                     model: { type: string }
 *                     provider: { type: string }
 *                     source: { type: string }
 *                     inputTokens: { type: number }
 *                     outputTokens: { type: number }
 *                     requestCount: { type: number }
 *                     costs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required: [type, amount]
 *                         properties:
 *                           type: { type: string, enum: [paid, free_tier_potential] }
 *                           amount: { type: number }
 *     responses:
 *       200:
 *         description: Daily snapshot stored
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ModelUsageSnapshot'
 *       401:
 *         description: Authentication required
 *       400:
 *         description: Invalid input
 */
app.put('/api/service/model-usage', asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasServiceAccess(req))) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { usageDate, updatedAt, models } = req.body;
  const normalizedUsageDate = parseIsoDateOnly(usageDate);
  const normalizedUpdatedAt = parseIsoDateTime(updatedAt);
  const normalizedModels = normalizeModelUsageModels(models);

  if (!normalizedUsageDate || !normalizedUpdatedAt || normalizedModels === null) {
    res.status(400).json({
      error: 'usageDate (YYYY-MM-DD), updatedAt (ISO datetime), and models[] are required',
    });
    return;
  }

  // Keep latest update for each day; older updates cannot overwrite newer snapshots.
  const upsertResult = await pool.query(
    `INSERT INTO model_usage (usage_date, updated_at, models_json)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (usage_date) DO UPDATE
     SET updated_at = EXCLUDED.updated_at,
         models_json = EXCLUDED.models_json
     WHERE EXCLUDED.updated_at >= model_usage.updated_at
     RETURNING usage_date, updated_at, models_json`,
    [normalizedUsageDate, normalizedUpdatedAt, JSON.stringify(normalizedModels)]
  );

  let row: Record<string, unknown> | undefined = upsertResult.rows[0];
  let updated = upsertResult.rows.length > 0;
  if (!row) {
    const currentResult = await pool.query(
      'SELECT usage_date, updated_at, models_json FROM model_usage WHERE usage_date = $1',
      [normalizedUsageDate]
    );
    row = currentResult.rows[0];
    updated = false;
  }

  if (!row) {
    res.status(500).json({ error: 'Failed to store model usage snapshot' });
    return;
  }

  const snapshot = buildModelUsageSnapshot(row);
  if (!snapshot) {
    res.status(500).json({ error: 'Stored model usage snapshot is invalid' });
    return;
  }

  res.json({ ...snapshot, updated });
}));

/**
 * @swagger
 * /api/service/status:
 *   put:
 *     tags: [Status]
 *     summary: Update server status (authenticated)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [state, currentTask, lastActive]
 *             properties:
 *               state:
 *                 type: string
 *                 enum: [active, busy, idle]
 *                 description: Current state of the Swissclaw agent
 *               currentTask:
 *                 type: string
 *                 description: Description of what the agent is currently doing
 *               lastActive:
 *                 type: string
 *                 format: date-time
 *                 description: Last active timestamp provided by service
 *     responses:
 *       200:
 *         description: Status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 state: { type: string }
 *                 currentTask: { type: string }
 *                 lastActive: { type: string, format: date-time }
 *       401:
 *         description: Authentication required
 *       400:
 *         description: Invalid input
 */
app.put('/api/service/status', asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasServiceAccess(req))) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { state, currentTask, lastActive } = req.body;

  if (!state || !['active', 'busy', 'idle'].includes(state)) {
    res.status(400).json({ error: 'state must be one of: active, busy, idle' });
    return;
  }

  if (!currentTask || typeof currentTask !== 'string') {
    res.status(400).json({ error: 'currentTask is required' });
    return;
  }

  const normalizedLastActive = parseIsoDateTime(lastActive);
  if (!normalizedLastActive) {
    res.status(400).json({ error: 'lastActive must be a valid ISO datetime' });
    return;
  }

  // True singleton row keyed on id=1.
  await pool.query(
    `INSERT INTO status (id, state, current_task, last_active, updated_at)
     VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET
       state = EXCLUDED.state,
       current_task = EXCLUDED.current_task,
       last_active = EXCLUDED.last_active,
       updated_at = NOW()`,
    [state, currentTask, normalizedLastActive]
  );

  // Broadcast to all connected clients
  io.emit('status-update', { state, currentTask, lastActive: normalizedLastActive });

  res.json({ state, currentTask, lastActive: normalizedLastActive });
}));

/**
 * @openapi
 * /api/service/messages/{id}/state:
 *   put:
 *     summary: Update message processing state
 *     description: Update the processing state of a chat message (received, processing, thinking, responded). For state=received, claim is atomic and only the first caller gets claimed=true.
 *     tags: [Service]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Message ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - state
 *             properties:
 *               state:
 *                 type: string
 *                 enum: [received, processing, done, failed, not-sent, timeout]
 *                 description: The processing state of the message
 *     responses:
 *       200:
 *         description: Message state updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 state:
 *                   type: string
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                 claimed:
 *                   type: boolean
 *                   description: For state=received, true means this caller claimed first delivery. false means already claimed by another worker.
 *       400:
 *         description: Invalid state value
 *       401:
 *         description: Unauthorized - Invalid or missing bearer token
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
app.put('/api/service/messages/:id/state', asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasServiceAccess(req))) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const idParam = req.params.id;
  if (!idParam) {
    res.status(400).json({ error: 'Message ID is required' });
    return;
  }
  const messageId = parseInt(idParam, 10);
  const { state } = req.body;

  // Validate state
  const validStates = ['received', 'processing', 'done', 'failed', 'not-sent', 'timeout'];
  if (!validStates.includes(state)) {
    res.status(400).json({ error: 'Invalid state. Must be one of: received, processing, done, failed, not-sent, timeout' });
    return;
  }

  if (state === 'received') {
    // Atomic claim: only the first worker can transition NULL -> received.
    const claimResult = await pool.query(
      `UPDATE messages
       SET processing_state = 'received', updated_at = NOW()
       WHERE id = $1 AND processing_state IS NULL
       RETURNING id, sender, updated_at`,
      [messageId]
    );

    if (claimResult.rows.length > 0) {
      const claimedMessage = claimResult.rows[0];
      const updatedAt = new Date(claimedMessage.updated_at).toISOString();
      io.emit('message-state', {
        messageId,
        state: 'received',
        sender: claimedMessage.sender,
        updatedAt,
      });
      res.json({
        id: messageId,
        state: 'received',
        updatedAt,
        claimed: true,
      });
      return;
    }

    const existingResult = await pool.query(
      'SELECT id, updated_at FROM messages WHERE id = $1',
      [messageId]
    );
    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const existingUpdatedAt = existingResult.rows[0].updated_at
      ? new Date(existingResult.rows[0].updated_at).toISOString()
      : new Date().toISOString();
    res.json({
      id: messageId,
      state: 'received',
      updatedAt: existingUpdatedAt,
      claimed: false,
    });
    return;
  }

  const updateResult = await pool.query(
    `UPDATE messages
     SET processing_state = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, sender, updated_at`,
    [state, messageId]
  );

  if (updateResult.rows.length === 0) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  const updatedMessage = updateResult.rows[0];
  const updatedAt = new Date(updatedMessage.updated_at).toISOString();
  io.emit('message-state', {
    messageId,
    state,
    sender: updatedMessage.sender,
    updatedAt,
  });

  res.json({
    id: messageId,
    state,
    updatedAt,
    claimed: true,
  });
}));

// Serve static files from React build in production (BEFORE auth middleware)
// This allows the React app to load so it can handle client-side routing
if (process.env.NODE_ENV === 'production') {
  const clientBuildDirCandidates = ['client/dist', 'client/build'];
  const clientBuildDir = clientBuildDirCandidates.find((dir) =>
    fs.existsSync(path.join(process.cwd(), dir, 'index.html'))
  ) || 'client/dist';

  // Serve built frontend assets
  app.use(express.static(clientBuildDir, {
    etag: true,
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      // Never cache index.html - it references the hashed assets
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        // Fingerprinted bundles (Vite /assets, CRA /static) can be cached long-term
        const normalized = filePath.replace(/\\/g, '/');
        if (!normalized.includes('/assets/') && !normalized.includes('/static/')) {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
      }
    }
  }));
}

// Mount enhanced auth router (must be before requireAuth middleware)
// Provides /auth/login, /auth/logout, /auth/validate, /auth/me, /auth/change-password
app.use('/auth', authRouter);

// Protect API routes with auth (static files already served above)
// Auth is now enforced in ALL environments (dev, test, production)
app.use('/api', requireAuth);

// Input validation helpers
const validateMessage = (data: unknown): data is ChatMessageData => {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  if (!msg.sender || typeof msg.sender !== 'string') return false;
  if (!msg.content || typeof msg.content !== 'string') return false;
  if ((msg.content as string).length > 5000) return false; // Max 5000 chars
  if ((msg.sender as string).length > 50) return false; // Max 50 chars
  return true;
};

const sanitizeString = (str: string): string => {
  return str.replace(/[<>]/g, ''); // Basic XSS prevention
};

// Generate task ID like TASK-001
const generateTaskId = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `TASK-${timestamp.slice(-3)}${Math.floor(Math.random() * 900 + 100)}`;
};

const READ_ONLY_TASK_TIMESTAMP_FIELDS = [
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
  'created',
  'updated',
] as const;

const getReadOnlyTaskTimestampField = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const body = payload as Record<string, unknown>;
  for (const field of READ_ONLY_TASK_TIMESTAMP_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      return field;
    }
  }

  return null;
};

const serializeKanbanTask = (
  task: KanbanTaskRow | Record<string, unknown>,
  options: { descriptionFallback?: string | null } = {}
): Record<string, unknown> => {
  const row = task as Record<string, unknown>;
  const descriptionFallback = options.descriptionFallback ?? null;
  const description = row.description === null || row.description === undefined
    ? descriptionFallback
    : row.description;
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;

  return {
    id: row.id,
    taskId: row.task_id || `TASK-${String(row.id).padStart(3, '0')}`,
    title: row.title,
    description,
    priority: row.priority,
    assignedTo: row.assigned_to ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    attachmentCount: row.attachment_count || 0,
    commentCount: row.comment_count || 0,
    position: row.position,
    createdAt,
    updatedAt,
  };
};

// API Routes

/**
 * @swagger
 * /api/status:
 *   get:
 *     tags: [Status]
 *     summary: Get current status snapshot for the status UI
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current status snapshot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 state: { type: string, enum: [active, busy, idle] }
 *                 currentTask: { type: string }
 *                 lastActive: { type: string, format: date-time }
 *                 chatCount: { type: integer }
 *                 activityCount: { type: integer }
 *                 modelUsage:
 *                   allOf:
 *                     - $ref: '#/components/schemas/ModelUsageSnapshot'
 *                   nullable: true
 */
app.get('/api/status', asyncHandler(async (req: Request, res: Response) => {
  const countsResult = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM messages
       WHERE created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich')) AS chat_count,
      (SELECT COUNT(*)::int FROM activities
       WHERE created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich')) AS activity_count`
  );
  const chatCount = countsResult.rows[0]?.chat_count || 0;
  const activityCount = countsResult.rows[0]?.activity_count || 0;

  const statusResult = await pool.query(
    'SELECT state, current_task, last_active FROM status WHERE id = 1 LIMIT 1'
  );

  const statusSnapshot = statusResult.rows[0] || {
    state: 'idle',
    current_task: 'Ready to help',
    last_active: new Date().toISOString(),
  };

  const modelUsageResult = await pool.query(
    'SELECT usage_date, updated_at, models_json FROM model_usage ORDER BY usage_date DESC LIMIT 1'
  );
  const modelUsage = modelUsageResult.rows.length > 0
    ? buildModelUsageSnapshot(modelUsageResult.rows[0])
    : null;

  res.json({
    state: statusSnapshot.state,
    currentTask: statusSnapshot.current_task,
    lastActive: new Date(statusSnapshot.last_active).toISOString(),
    chatCount,
    activityCount,
    modelUsage,
  });
}));

/**
 * @swagger
 * /api/messages:
 *   get:
 *     tags: [Chat]
 *     summary: Get recent chat messages (paginated)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *         description: Number of messages to return (max 200)
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Cursor for pagination (timestamp of oldest message from previous page)
 *     responses:
 *       200:
 *         description: Recent messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChatMessage'
 */
app.get('/api/messages', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 25, 1), 200);
  const before = req.query.before as string | undefined;

  let query = 'SELECT * FROM messages ORDER BY created_at DESC LIMIT $1';
  let params: (string | number)[] = [limit];

  if (before !== undefined) {
    const beforeTs = parseIsoDateTime(before);
    if (!beforeTs) {
      res.status(400).json({ error: 'Invalid before cursor. Must be ISO datetime.' });
      return;
    }
    query = 'SELECT * FROM messages WHERE created_at < $1 ORDER BY created_at DESC LIMIT $2';
    params = [beforeTs, limit];
  }

  const result = await pool.query(query, params);
  res.json(result.rows);
}));

/**
 * @swagger
 * /api/model-usage:
 *   get:
 *     tags: [Model Usage]
 *     summary: Get historical daily model usage snapshots
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Get a single daily snapshot by YYYY-MM-DD
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Get snapshots starting from YYYY-MM-DD
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of daily snapshots to return (max 365)
 *     responses:
 *       200:
 *         description: Model usage snapshot(s)
 *       400:
 *         description: Invalid query parameters
 *       404:
 *         description: Snapshot not found
 */
app.get('/api/model-usage', asyncHandler(async (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 30, 1), 365);

  if (date && startDate) {
    res.status(400).json({ error: 'Use either date or startDate, not both.' });
    return;
  }

  if (date) {
    const normalizedDate = parseIsoDateOnly(date);
    if (!normalizedDate) {
      res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD.' });
      return;
    }

    const result = await pool.query(
      'SELECT usage_date, updated_at, models_json FROM model_usage WHERE usage_date = $1',
      [normalizedDate]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Model usage snapshot not found' });
      return;
    }

    const snapshot = buildModelUsageSnapshot(result.rows[0]);
    if (!snapshot) {
      res.status(500).json({ error: 'Stored model usage snapshot is invalid' });
      return;
    }

    res.json(snapshot);
    return;
  }

  if (startDate) {
    const normalizedStartDate = parseIsoDateOnly(startDate);
    if (!normalizedStartDate) {
      res.status(400).json({ error: 'Invalid startDate. Expected YYYY-MM-DD.' });
      return;
    }

    const result = await pool.query(
      `SELECT usage_date, updated_at, models_json
       FROM model_usage
       WHERE usage_date >= $1
       ORDER BY usage_date ASC
       LIMIT $2`,
      [normalizedStartDate, limit]
    );

    const snapshots = result.rows
      .map((row) => buildModelUsageSnapshot(row))
      .filter((row): row is ModelUsageSnapshot => row !== null);

    res.json({ snapshots, count: snapshots.length });
    return;
  }

  const result = await pool.query(
    `SELECT usage_date, updated_at, models_json
     FROM model_usage
     ORDER BY usage_date DESC
     LIMIT $1`,
    [limit]
  );
  const snapshots = result.rows
    .map((row) => buildModelUsageSnapshot(row))
    .filter((row): row is ModelUsageSnapshot => row !== null);

  res.json({ snapshots, count: snapshots.length });
}));

/**
 * @swagger
 * /api/kanban:
 *   get:
 *     tags: [Kanban]
 *     summary: Get full kanban board (columns + tasks)
 *     responses:
 *       200:
 *         description: Kanban board state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 columns:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KanbanColumn'
 *                 tasks:
 *                   type: object
 *                   description: Tasks grouped by column name
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       $ref: '#/components/schemas/KanbanTask'
 */
app.get('/api/kanban', asyncHandler(async (req: Request, res: Response) => {
  // Get all columns with their tasks
  const columnsResult = await pool.query(
    'SELECT * FROM kanban_columns ORDER BY position'
  );

  const kanban: Record<string, unknown[]> = {};

  for (const column of columnsResult.rows) {
    const tasksResult = await pool.query(
      `SELECT id, task_id, title, description, priority, assigned_to, tags,
              attachment_count, comment_count, position, created_at, updated_at
       FROM kanban_tasks
       WHERE column_id = $1
       ORDER BY position`,
      [column.id]
    );

    kanban[column.name] = tasksResult.rows.map((task: Record<string, unknown>) => (
      serializeKanbanTask(task, { descriptionFallback: '' })
    ));
  }

  // Also include column metadata
  const columns = columnsResult.rows.map((col: Record<string, unknown>) => ({
    name: col.name,
    displayName: col.display_name,
    emoji: col.emoji,
    color: col.color,
    position: col.position
  }));

  res.json({ columns, tasks: kanban });
}));

/**
 * @swagger
 * /api/kanban/tasks:
 *   post:
 *     tags: [Kanban]
 *     summary: Create a new kanban task
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [columnName, title]
 *             properties:
 *               columnName: { type: string, example: todo }
 *               title: { type: string, maxLength: 200 }
 *               description: { type: string }
 *               priority: { type: string, enum: [low, medium, high], default: medium }
 *               assignedTo: { type: string, maxLength: 50 }
 *               tags: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Task created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KanbanTask'
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Column not found
 */
app.post('/api/kanban/tasks', asyncHandler(async (req: Request, res: Response) => {
  const readOnlyField = getReadOnlyTaskTimestampField(req.body);
  if (readOnlyField) {
    res.status(400).json({ error: `${readOnlyField} is read-only and cannot be set explicitly` });
    return;
  }

  const { columnName, title, description, priority = 'medium', assignedTo, tags = [] } = req.body;

  if (!columnName || !title) {
    res.status(400).json({ error: 'Column name and title required' });
    return;
  }

  // Get column id
  const columnResult = await pool.query(
    'SELECT id FROM kanban_columns WHERE name = $1',
    [columnName]
  );

  if (columnResult.rows.length === 0) {
    res.status(404).json({ error: 'Column not found' });
    return;
  }

  const columnId = columnResult.rows[0].id;

  // Get max position for this column using sparse positioning
  const posResult = await pool.query(
    'SELECT MAX(position) as max_pos FROM kanban_tasks WHERE column_id = $1',
    [columnId]
  );

  const maxPos = posResult.rows[0]?.max_pos || 0n;
  const position = BigInt(maxPos) + POSITION_GAP;
  const taskId = generateTaskId();

  const result = await pool.query(
    `INSERT INTO kanban_tasks
     (task_id, column_id, title, description, priority, assigned_to, tags, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [taskId, columnId, sanitizeString(title), description ? sanitizeString(description) : null, priority, assignedTo, JSON.stringify(tags), position]
  );

  const task = result.rows[0];
  res.status(201).json(serializeKanbanTask(task));
}));

/**
 * @swagger
 * /api/kanban/tasks/{id}:
 *   put:
 *     tags: [Kanban]
 *     summary: Update a kanban task (move, edit, reorder)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               columnName: { type: string, description: Move to this column }
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, enum: [low, medium, high] }
 *               assignedTo: { type: string }
 *               tags: { type: array, items: { type: string } }
 *               position: { type: integer }
 *     responses:
 *       200:
 *         description: Task updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KanbanTask'
 *       404:
 *         description: Task not found
 */
app.put('/api/kanban/tasks/:id', asyncHandler(async (req: Request, res: Response) => {
  const readOnlyField = getReadOnlyTaskTimestampField(req.body);
  if (readOnlyField) {
    res.status(400).json({ error: `${readOnlyField} is read-only and cannot be set explicitly` });
    return;
  }

  const { id } = req.params;
  const { columnName, title, description, priority, assignedTo, tags, position, targetTaskId, insertAfter } = req.body;

  let columnId: number | null = null;
  if (columnName) {
    const columnResult = await pool.query(
      'SELECT id FROM kanban_columns WHERE name = $1',
      [columnName]
    );
    if (columnResult.rows.length > 0) {
      columnId = columnResult.rows[0].id;
    }
  }

  // If targetTaskId is provided, calculate position automatically
  let calculatedPosition: bigint | null = null;
  if (targetTaskId !== undefined && columnId !== null) {
    try {
      calculatedPosition = await calculateNewPosition(pool, columnId, targetTaskId, insertAfter || false);
    } catch (error) {
      console.error('Error calculating position:', error);
      // Fall back to explicit position if provided
    }
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (columnId !== null) {
    updates.push(`column_id = $${paramCount++}`);
    values.push(columnId);
  }
  if (title !== undefined) {
    updates.push(`title = $${paramCount++}`);
    values.push(sanitizeString(title));
  }
  if (description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(description ? sanitizeString(description) : null);
  }
  if (priority !== undefined) {
    updates.push(`priority = $${paramCount++}`);
    values.push(priority);
  }
  if (assignedTo !== undefined) {
    updates.push(`assigned_to = $${paramCount++}`);
    values.push(assignedTo);
  }
  if (tags !== undefined) {
    updates.push(`tags = $${paramCount++}`);
    values.push(JSON.stringify(tags));
  }
  
  // Use calculated position if available, otherwise use explicit position
  if (calculatedPosition !== null) {
    updates.push(`position = $${paramCount++}`);
    values.push(calculatedPosition.toString()); // Convert BigInt to string for PostgreSQL
  } else if (position !== undefined) {
    updates.push(`position = $${paramCount++}`);
    values.push(position);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(
    `UPDATE kanban_tasks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const task = result.rows[0];
  
  // Check if rebalancing is needed
  if (columnId !== null) {
    const needsRebalance = await checkAndRebalanceIfNeeded(pool, columnId);
    if (needsRebalance) {
      // Refetch the task after rebalancing
      const refreshedResult = await pool.query(
        'SELECT * FROM kanban_tasks WHERE id = $1',
        [id]
      );
      if (refreshedResult.rows.length > 0) {
        const refreshedTask = refreshedResult.rows[0];
        res.json({
          ...serializeKanbanTask(refreshedTask),
          rebalanced: true
        });
        return;
      }
    }
  }

  res.json({
    ...serializeKanbanTask(task),
    rebalanced: false
  });
}));

/**
 * @swagger
 * /api/kanban/reorder:
 *   post:
 *     tags: [Kanban]
 *     summary: Batch reorder tasks within a column
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [columnId, taskPositions]
 *             properties:
 *               columnId:
 *                 type: integer
 *                 description: ID of the column to reorder tasks in
 *               taskPositions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [taskId, position]
 *                   properties:
 *                     taskId:
 *                       type: integer
 *                     position:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Tasks reordered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 rebalanced:
 *                   type: boolean
 *                   description: Whether column was rebalanced due to small gaps
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Column not found
 */
app.post('/api/kanban/reorder', asyncHandler(async (req: Request, res: Response) => {
  const { columnId, taskPositions } = req.body;

  if (!columnId || !Array.isArray(taskPositions) || taskPositions.length === 0) {
    res.status(400).json({ error: 'columnId and taskPositions array required' });
    return;
  }

  // Verify column exists
  const columnResult = await pool.query(
    'SELECT id FROM kanban_columns WHERE id = $1',
    [columnId]
  );
  if (columnResult.rows.length === 0) {
    res.status(404).json({ error: 'Column not found' });
    return;
  }

  // Update positions in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const { taskId, position } of taskPositions) {
      await client.query(
        'UPDATE kanban_tasks SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND column_id = $3',
        [position, taskId, columnId]
      );
    }

    // Check if rebalancing is needed
    const needsRebalance = await checkAndRebalanceIfNeeded(client, columnId);
    
    await client.query('COMMIT');
    
    res.json({ success: true, rebalanced: needsRebalance });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reorder transaction failed:', error);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  } finally {
    client.release();
  }
}));

/**
 * @swagger
 * /api/kanban/tasks/{id}:
 *   delete:
 *     tags: [Kanban]
 *     summary: Delete a kanban task
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Task deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 deleted: { $ref: '#/components/schemas/KanbanTask' }
 *       404:
 *         description: Task not found
 */
app.delete('/api/kanban/tasks/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await pool.query(
    'DELETE FROM kanban_tasks WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ success: true, deleted: serializeKanbanTask(result.rows[0]) });
}));

/**
 * @swagger
 * /api/activities:
 *   post:
 *     tags: [Activities]
 *     summary: Create an activity record
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, description]
 *             properties:
 *               type: { type: string, maxLength: 50 }
 *               description: { type: string, maxLength: 500 }
 *               sender: { type: string, maxLength: 50 }
 *               metadata: { type: object }
 *     responses:
 *       200:
 *         description: Activity created and broadcast via Socket.io
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Activity'
 *       400:
 *         description: Invalid input
 */
app.post('/api/activities', asyncHandler(async (req: Request, res: Response) => {
  const { type, description, metadata, sender } = req.body;

  // Validation
  if (!type || typeof type !== 'string' || type.length > 50) {
    res.status(400).json({ error: 'Invalid type' });
    return;
  }
  if (!description || typeof description !== 'string' || description.length > 500) {
    res.status(400).json({ error: 'Invalid description' });
    return;
  }
  if (sender !== undefined && (typeof sender !== 'string' || sender.length > 50)) {
    res.status(400).json({ error: 'Invalid sender' });
    return;
  }

  const safeSender = sender ? sanitizeString(sender) : null;

  const result = await pool.query(
    'INSERT INTO activities (type, description, sender, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
    [sanitizeString(type), sanitizeString(description), safeSender, JSON.stringify(metadata || {})]
  );

  io.emit('activity', result.rows[0]);
  res.json(result.rows[0]);
}));

/**
 * @swagger
 * /api/activities:
 *   get:
 *     tags: [Activities]
 *     summary: Get paginated activities
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of activities to return
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Cursor for pagination (timestamp of oldest activity from previous page)
 *     responses:
 *       200:
 *         description: List of activities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activities:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Activity'
 *                 hasMore:
 *                   type: boolean
 */
app.get('/api/activities', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const before = req.query.before as string | undefined;

  let query: string;
  let params: (string | number)[];

  if (before) {
    query = `
      SELECT * FROM activities
      WHERE created_at < $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    params = [before, limit + 1];
  } else {
    query = `
      SELECT * FROM activities
      ORDER BY created_at DESC
      LIMIT $1
    `;
    params = [limit + 1];
  }

  const result = await pool.query(query, params);

  const hasMore = result.rows.length > limit;
  const activities = hasMore ? result.rows.slice(0, limit) : result.rows;

  res.json({
    activities,
    hasMore
  });
}));

// Socket.io with authentication and rate limiting
io.use(async (socket: Socket, next: (err?: Error) => void) => {
  try {
    // Verify auth token from handshake
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    // First check database-backed sessions
    const session = await sessionStore.validateSession(token);
    if (session) {
      // Attach user info to socket
      socket.data.user = session;
      return next();
    }

    // Fall back to in-memory sessions (for backward compatibility during transition)
    if (sessions.has(token)) {
      return next();
    }

    return next(new Error('Authentication required'));
  } catch (error) {
    logger.error({ err: error }, 'Socket.io auth error');
    return next(new Error('Authentication error'));
  }
});

const messageRateLimits = new Map<string, RateLimitEntry>();

io.on('connection', (socket: Socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');

  // Rate limit per socket
  messageRateLimits.set(socket.id, { count: 0, lastReset: Date.now() });

  socket.on('message', async (data: unknown) => {
    try {
      // Rate limiting
      const limit = messageRateLimits.get(socket.id);
      if (!limit) return;
      if (Date.now() - limit.lastReset > 60000) {
        limit.count = 0;
        limit.lastReset = Date.now();
      }
      if (limit.count >= 30) { // Max 30 messages per minute
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }
      limit.count++;

      // Validation
      if (!validateMessage(data)) {
        socket.emit('error', { message: 'Invalid message format' });
        return;
      }

      const { sender, content } = data;
      const safeSender = sanitizeString(sender);
      const safeContent = sanitizeString(content);
      const result = await pool.query(
        'INSERT INTO messages (sender, content) VALUES ($1, $2) RETURNING *',
        [safeSender, safeContent]
      );

      io.emit('message', result.rows[0]);

      // Also emit as activity for the activity feed
      const activityResult = await pool.query(
        'INSERT INTO activities (type, description, sender, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
        ['chat', safeContent, safeSender, JSON.stringify({ sender: safeSender, messageId: result.rows[0].id })]
      );
      io.emit('activity', activityResult.rows[0]);
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Socket message error');
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'Client disconnected');
    messageRateLimits.delete(socket.id);
  });
});

// Build info - get commit hash from env or file
const getBuildInfo = (): BuildInfo => {
  let commitHash = process.env.RENDER_GIT_COMMIT;
  if (!commitHash) {
    try {
      commitHash = execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commitHash = 'unknown';
    }
  }
  return {
    buildDate: new Date().toISOString(),
    commit: commitHash
  };
};

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties:
 *                     status: { type: string, example: ok }
 *                     timestamp: { type: string, format: date-time }
 *                 - $ref: '#/components/schemas/BuildInfo'
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ...getBuildInfo()
  });
});

/**
 * @swagger
 * /api/build:
 *   get:
 *     tags: [System]
 *     summary: Get build version and commit info
 *     responses:
 *       200:
 *         description: Build information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BuildInfo'
 */
app.get('/api/build', (_req: Request, res: Response) => {
  res.json(getBuildInfo());
});

/**
 * @swagger
 * /api/seed:
 *   post:
 *     tags: [System]
 *     summary: Seed initial kanban data (idempotent)
 *     responses:
 *       200:
 *         description: Seed result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 backlog: { type: integer }
 *                 todo: { type: integer }
 *                 inProgress: { type: integer }
 *                 review: { type: integer }
 *                 done: { type: integer }
 *                 waitingForNeil: { type: integer }
 */
app.post('/api/seed', asyncHandler(async (req: Request, res: Response) => {
  // Check if we already have tasks
  const existing = await pool.query('SELECT COUNT(*) as count FROM kanban_tasks');
  if (parseInt(existing.rows[0].count) > 0) {
    res.json({ message: 'Already seeded', count: existing.rows[0].count });
    return;
  }

    // Get column IDs
    const columns = await pool.query('SELECT id, name FROM kanban_columns');
    const columnMap: Record<string, number> = {};
    columns.rows.forEach((c: { id: number; name: string }) => columnMap[c.name] = c.id);

    // Seed Backlog tasks
    const backlogTasks = [
      { title: 'Zwift integration', description: 'Credentials now available in 1Password. Scope: pull ride stats, achievements, level progress', priority: 'medium', tags: ['integration', 'fitness'] },
      { title: 'CV match score calculator', description: 'Rate job postings 1-10 based on CV keyword overlap', priority: 'medium', tags: ['ai', 'jobs'] },
      { title: 'PDF Morning Report', description: 'Create PDF version of daily morning report, save to Google Drive', priority: 'low', tags: ['automation', 'reports'] }
    ];

    for (let i = 0; i < backlogTasks.length; i++) {
      await pool.query(
        'INSERT INTO kanban_tasks (task_id, column_id, title, description, priority, tags, position) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [generateTaskId(), columnMap['backlog'], backlogTasks[i]!.title, backlogTasks[i]!.description, backlogTasks[i]!.priority, JSON.stringify(backlogTasks[i]!.tags), i]
      );
    }

    // Seed To Do tasks
    await pool.query(
      'INSERT INTO kanban_tasks (task_id, column_id, title, description, priority, assigned_to, tags, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [generateTaskId(), columnMap['todo'], 'Job search automation', 'Automated job discovery and ranking', 'medium', 'swissclaw', JSON.stringify(['jobs', 'automation']), 0]
    );

    // Seed In Progress tasks
    await pool.query(
      'INSERT INTO kanban_tasks (task_id, column_id, title, description, priority, assigned_to, tags, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [generateTaskId(), columnMap['inProgress'], 'Swissclaw Hub Kanban Redesign', 'Replace dashboard sections with unified kanban board with drag-and-drop', 'high', 'swissclaw', JSON.stringify(['kanban', 'ui']), 0]
    );

    // Seed Review tasks
    await pool.query(
      'INSERT INTO kanban_tasks (task_id, column_id, title, description, priority, assigned_to, tags, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [generateTaskId(), columnMap['review'], 'Auth flow implementation', 'Login system with session tokens', 'high', 'swissclaw', JSON.stringify(['auth', 'security']), 0]
    );

    // Seed Done tasks
    const doneTasks = [
      { title: 'Add deepseek-v3.2 to model aliases', description: 'Added as 2nd priority fallback after k2.5', priority: 'medium' },
      { title: 'Swissclaw Hub initial setup', description: 'Database backend, auth flow, real-time chat', priority: 'high' }
    ];

    for (let i = 0; i < doneTasks.length; i++) {
      await pool.query(
        'INSERT INTO kanban_tasks (task_id, column_id, title, description, priority, position) VALUES ($1, $2, $3, $4, $5, $6)',
        [generateTaskId(), columnMap['done'], doneTasks[i]!.title, doneTasks[i]!.description, doneTasks[i]!.priority, i]
      );
    }

    // Seed Waiting for Neil tasks
    await pool.query(
      'INSERT INTO kanban_tasks (task_id, column_id, title, description, priority, assigned_to, tags, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [generateTaskId(), columnMap['waiting-for-neil'], 'Review GitHub repo permissions', 'Need access to configure webhooks and secrets', 'medium', 'neil', JSON.stringify(['review', 'infra']), 0]
    );

    res.json({
      message: 'Seeded successfully',
      backlog: backlogTasks.length,
      todo: 1,
      inProgress: 1,
      review: 1,
      done: doneTasks.length,
      waitingForNeil: 1
    });
}));

// Serve React app for any non-API routes (must be last)
if (process.env.NODE_ENV === 'production') {
  const clientBuildDirCandidates = ['client/dist', 'client/build'];
  const clientBuildDir = clientBuildDirCandidates.find((dir) =>
    fs.existsSync(path.join(process.cwd(), dir, 'index.html'))
  ) || 'client/dist';

  const indexPath = path.join(process.cwd(), clientBuildDir, 'index.html');
  // Serve React app for any non-API routes
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(indexPath);
  });
}

// Centralized error handler - must be after all routes
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

// Only start the HTTP server when this file is executed directly.
// When required from tests, we just reuse the Express app and pool
// without opening a real network port.
if (require.main === module) {
  httpServer.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'Swissclaw Hub server running');
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing connections...');
    await pool.end();
    httpServer.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

// For integration tests: reset database state
async function resetTestDb(): Promise<void> {
  // Truncate tables to reset state for tests (preserve users and sessions for auth)
  await pool.query('TRUNCATE TABLE kanban_tasks, kanban_columns, messages, activities, model_usage, status, sessions RESTART IDENTITY CASCADE');
  
  // Re-insert default kanban columns
  await pool.query(`
    INSERT INTO kanban_columns (name, display_name, emoji, color, position)
    VALUES
      ('backlog', 'Backlog', '\u{1F4DD}', '#6b7280', 0),
      ('todo', 'To Do', '\u{1F4CB}', '#3b82f6', 1),
      ('inProgress', 'In Progress', '\u{1F680}', '#f59e0b', 2),
      ('review', 'Review', '\u{1F440}', '#8b5cf6', 3),
      ('done', 'Done', '\u2705', '#10b981', 4),
      ('waiting-for-neil', 'Waiting for Neil', '\u23F8\uFE0F', '#ef4444', 5)
    ON CONFLICT (name) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      emoji = EXCLUDED.emoji,
      color = EXCLUDED.color,
      position = EXCLUDED.position
  `);

  // Seed test admin user for backward compatibility using current auth env values.
  const seedUsername = AUTH_USERNAME || 'admin';
  const seedPassword = AUTH_PASSWORD || 'test-only-default';
  const passwordHash = await bcrypt.hash(seedPassword, 10);
  await pool.query(
    `INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       role = EXCLUDED.role,
       password_hash = EXCLUDED.password_hash,
       updated_at = NOW()`,
    ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'admin@example.com', seedUsername, passwordHash, 'admin']
  );

  await pool.query(
    `INSERT INTO status (id, state, current_task, last_active, updated_at)
     VALUES (1, 'idle', 'Ready to help', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       state = EXCLUDED.state,
       current_task = EXCLUDED.current_task,
       last_active = EXCLUDED.last_active,
       updated_at = EXCLUDED.updated_at`
  );
}

// Export pieces needed for integration tests (io needed for teardown so Jest can exit)
export {
  app,
  httpServer,
  io,
  pool,
  resetTestDb,
};
