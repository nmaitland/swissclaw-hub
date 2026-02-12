import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { Pool } from 'pg';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import 'dotenv/config';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';
import logger from './lib/logger';
import { asyncHandler, errorHandler } from './lib/errors';
import type { ChatMessageData, RateLimitEntry, ParsedTask, BuildInfo } from './types';

const app = express();
const httpServer = createServer(app);

// Security: Session-based authentication
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'changeme123';

// Simple session store (in-memory, cleared on restart)
const sessions = new Set<string>();

// Auth middleware
const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  // Public endpoints that don't require auth
  // When mounted at /api, req.path is relative (e.g., /kanban not /api/kanban)
  const publicApiPaths = ['/login', '/build', '/kanban', '/tasks', '/seed'];
  const publicRootPaths = ['/health', '/login'];

  console.log('Auth middleware:', { path: req.path, method: req.method, publicApiPaths });
  
  if (publicApiPaths.includes(req.path) || publicRootPaths.includes(req.path)) {
    console.log('Public path allowed:', req.path);
    next();
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string | undefined);
  console.log('Auth check:', { hasToken: !!token, tokenLength: token?.length, sessionsCount: sessions.size });
  
  if (!token || !sessions.has(token)) {
    console.log('Auth failed for path:', req.path);
    res.status(401).json({ error: 'Authentication required', loginUrl: '/login' });
    return;
  }

  console.log('Auth passed for path:', req.path);
  next();
};

// Serve login page (defined before body parser, uses raw HTML)
app.get('/login', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Swissclaw Hub - Login</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
        }
        .login-box {
          background: rgba(255, 255, 255, 0.05);
          padding: 2rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 69, 0, 0.3);
          width: 100%;
          max-width: 400px;
          text-align: center;
        }
        h1 {
          color: #ff4500;
          margin: 0 0 1.5rem 0;
        }
        input {
          width: 100%;
          padding: 0.75rem;
          margin: 0.5rem 0;
          border: 1px solid rgba(255, 69, 0, 0.3);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.3);
          color: #e5e7eb;
          font-size: 1rem;
          box-sizing: border-box;
        }
        input:focus {
          outline: none;
          border-color: #ff4500;
        }
        button {
          width: 100%;
          padding: 0.75rem;
          margin-top: 1rem;
          background: #ff4500;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
        }
        button:hover {
          background: #ff6b35;
        }
        .error {
          color: #ef4444;
          margin-top: 1rem;
        }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h1>\u{1F980} Swissclaw Hub</h1>
        <form id="loginForm">
          <input type="text" id="username" placeholder="Username" required />
          <input type="password" id="password" placeholder="Password" required />
          <button type="submit">Login</button>
        </form>
        <div id="error" class="error"></div>
      </div>
      <script>
        document.getElementById('loginForm').onsubmit = async (e) => {
          e.preventDefault();
          const username = document.getElementById('username').value;
          const password = document.getElementById('password').value;

          const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const data = await res.json();
          if (data.token) {
            localStorage.setItem('authToken', data.token);
            window.location.href = '/?token=' + data.token;
          } else {
            document.getElementById('error').textContent = 'Invalid credentials';
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

// Database setup with connection limits
// In test env, support TEST_DB_* vars so CI can set them without DATABASE_URL
function getConnectionString(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV === 'test') {
    const user = process.env.TEST_DB_USER || 'postgres';
    const password = process.env.TEST_DB_PASSWORD || 'password';
    const host = process.env.TEST_DB_HOST || 'localhost';
    const port = process.env.TEST_DB_PORT || '5433';
    const database = process.env.TEST_DB_NAME || 'swissclaw_hub_test';
    return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }
  return undefined;
}
const pool = new Pool({
  connectionString: getConnectionString(),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
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

// API Documentation — Swagger UI (no auth required)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Swissclaw Hub API Docs',
}));
app.get('/api-docs.json', (_req: Request, res: Response) => {
  res.json(swaggerSpec);
});

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
app.post('/api/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = Math.random().toString(36).substring(2);
  sessions.add(token);
  res.json({ token, success: true });
});

// Service token auth middleware
const SWISSCLAW_TOKEN = process.env.SWISSCLAW_TOKEN || 'dev-token-change-in-production';

/**
 * @swagger
 * /api/service/activities:
 *   post:
 *     tags: [Activities]
 *     summary: Create activity (service-to-service)
 *     security:
 *       - ServiceToken: []
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
 *               metadata: { type: object }
 *     responses:
 *       200:
 *         description: Activity created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Activity'
 *       401:
 *         description: Invalid service token
 */
app.post('/api/service/activities', asyncHandler(async (req: Request, res: Response) => {
  const serviceToken = req.headers['x-service-token'];
  if (serviceToken !== SWISSCLAW_TOKEN) {
    res.status(401).json({ error: 'Invalid service token' });
    return;
  }

  const { type, description, metadata } = req.body;

  if (!type || !description) {
    res.status(400).json({ error: 'Type and description required' });
    return;
  }

  const result = await pool.query(
    'INSERT INTO activities (type, description, metadata) VALUES ($1, $2, $3) RETURNING *',
    [sanitizeString(type), sanitizeString(description), JSON.stringify(metadata || {})]
  );

  io.emit('activity', result.rows[0]);
  res.json(result.rows[0]);
}));

// Serve static files from React build in production (BEFORE auth middleware)
// This allows the React app to load so it can handle client-side routing
if (process.env.NODE_ENV === 'production') {
  // Cache hashed assets (JS/CSS) aggressively - they have content hashes in filenames
  app.use('/static', express.static('client/build/static', {
    maxAge: '1y', // 1 year - hashed assets never change
    immutable: true,
    etag: true
  }));

  // Serve other build files (index.html, etc) with no cache
  app.use(express.static('client/build', {
    etag: true,
    setHeaders: (res, filePath) => {
      // Never cache index.html - it references the hashed assets
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
}

// Protect API routes with auth (static files already served above)
if (process.env.NODE_ENV === 'production') {
  // Only apply auth to API routes
  app.use('/api', requireAuth);
}

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

// API Routes

/**
 * @swagger
 * /api/status:
 *   get:
 *     tags: [Status]
 *     summary: Get server status, recent messages, and activities
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current server status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: online }
 *                 swissclaw:
 *                   type: object
 *                   properties:
 *                     state: { type: string, enum: [active, busy, idle] }
 *                     currentTask: { type: string }
 *                     lastActive: { type: string, format: date-time }
 *                 recentMessages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ChatMessage'
 *                 recentActivities:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Activity'
 */
app.get('/api/status', asyncHandler(async (req: Request, res: Response) => {
  const messagesResult = await pool.query(
    'SELECT * FROM messages ORDER BY created_at DESC LIMIT 10'
  );

  const activitiesResult = await pool.query(
    'SELECT * FROM activities ORDER BY created_at DESC LIMIT 20'
  );

  res.json({
    status: 'online',
    swissclaw: {
      state: 'active',
      currentTask: 'Building Swissclaw Hub',
      lastActive: new Date().toISOString()
    },
    recentMessages: messagesResult.rows,
    recentActivities: activitiesResult.rows
  });
}));

/**
 * @swagger
 * /api/messages:
 *   get:
 *     tags: [Chat]
 *     summary: Get recent chat messages
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Last 50 messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChatMessage'
 */
app.get('/api/messages', asyncHandler(async (req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT * FROM messages ORDER BY created_at DESC LIMIT 50'
  );
  res.json(result.rows);
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

    kanban[column.name] = tasksResult.rows.map((task: Record<string, unknown>) => ({
      id: task.id,
      taskId: task.task_id || `TASK-${String(task.id).padStart(3, '0')}`,
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      assignedTo: task.assigned_to,
      tags: task.tags || [],
      attachmentCount: task.attachment_count || 0,
      commentCount: task.comment_count || 0,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    }));
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
  const { columnName, title, description, priority = 'medium', assignedTo, tags = [] } = req.body;

  console.log('POST /api/kanban/tasks received:', { columnName, title, priority, assignedTo, tags });
  logger.info({ columnName, title, priority }, 'Creating kanban task');

  if (!columnName || !title) {
    res.status(400).json({ error: 'Column name and title required' });
    return;
  }

  // Get column id
  const columnResult = await pool.query(
    'SELECT id FROM kanban_columns WHERE name = $1',
    [columnName]
  );

  console.log('Column query result:', columnResult.rows);
  logger.info({ columnName, columnExists: columnResult.rows.length > 0 }, 'Column lookup');

  if (columnResult.rows.length === 0) {
    console.log('Column not found:', columnName);
    logger.warn({ columnName }, 'Column not found in database');
    res.status(404).json({ error: 'Column not found' });
    return;
  }

  const columnId = columnResult.rows[0].id;

  // Get max position for this column
  const posResult = await pool.query(
    'SELECT MAX(position) as max_pos FROM kanban_tasks WHERE column_id = $1',
    [columnId]
  );

  const position = (posResult.rows[0]?.max_pos || 0) + 1;
  const taskId = generateTaskId();

  const result = await pool.query(
    `INSERT INTO kanban_tasks
     (task_id, column_id, title, description, priority, assigned_to, tags, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [taskId, columnId, sanitizeString(title), description ? sanitizeString(description) : null, priority, assignedTo, JSON.stringify(tags), position]
  );

  const task = result.rows[0];
  res.status(201).json({
    id: task.id,
    taskId: task.task_id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    assignedTo: task.assigned_to,
    tags: task.tags || [],
    position: task.position,
    createdAt: task.created_at,
    updatedAt: task.updated_at
  });
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
  const { id } = req.params;
  const { columnName, title, description, priority, assignedTo, tags, position } = req.body;

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
  if (position !== undefined) {
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
  res.json({
    id: task.id,
    taskId: task.task_id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    assignedTo: task.assigned_to,
    tags: task.tags || [],
    position: task.position,
    createdAt: task.created_at,
    updatedAt: task.updated_at
  });
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

  res.json({ success: true, deleted: result.rows[0] });
}));

// Tasks API - Neil's action items from kanban.md
function parseTasksFromKanban(): ParsedTask[] {
  try {
    // Try multiple paths to find kanban.md
    const possiblePaths = [
      path.join(process.cwd(), '..', '..', 'kanban', 'kanban.md'),
      path.join(process.cwd(), '..', 'kanban', 'kanban.md'),
      path.join('/home/neil/.openclaw/workspace', 'kanban', 'kanban.md'),
      '/opt/render/project/src/kanban/kanban.md'
    ];

    let kanbanPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        kanbanPath = p;
        break;
      }
    }

    if (!kanbanPath) {
      logger.warn('Kanban file not found for tasks');
      return [];
    }

    const content = fs.readFileSync(kanbanPath, 'utf8');

    const tasks: ParsedTask[] = [];
    let inActionItems = false;
    let id = 1;

    content.split('\n').forEach(line => {
      if (line.includes("## \u{1F464} Neil's Action Items")) {
        inActionItems = true;
      } else if (line.startsWith('## ')) {
        inActionItems = false;
      } else if (inActionItems && line.trim().startsWith('- [ ]')) {
        // Parse checkbox items: - [ ] **Title** — description
        const match = line.match(/^- \[ \] \*\*(.+?)\*\*\s*[-\u2014]\s*(.+)$/);
        if (match) {
          tasks.push({
            id: id++,
            title: match[1]!.trim(),
            description: match[2]!.trim(),
            completed: false,
            priority: 'medium',
            dueDate: null
          });
        } else {
          // Simple fallback
          const simpleMatch = line.match(/^- \[ \] \*\*(.+?)\*\*/);
          if (simpleMatch) {
            tasks.push({
              id: id++,
              title: simpleMatch[1]!.trim(),
              description: '',
              completed: false,
              priority: 'medium',
              dueDate: null
            });
          }
        }
      }
    });

    return tasks;
  } catch (err) {
    logger.error({ err }, 'Error parsing tasks');
    return [];
  }
}

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: Get action items parsed from kanban.md
 *     responses:
 *       200:
 *         description: Task list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   title: { type: string }
 *                   description: { type: string }
 *                   completed: { type: boolean }
 *                   priority: { type: string }
 *                   dueDate: { type: string, nullable: true }
 */
app.get('/api/tasks', asyncHandler(async (req: Request, res: Response) => {
  const tasks = parseTasksFromKanban();
  res.json(tasks);
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
  const { type, description, metadata } = req.body;

  // Validation
  if (!type || typeof type !== 'string' || type.length > 50) {
    res.status(400).json({ error: 'Invalid type' });
    return;
  }
  if (!description || typeof description !== 'string' || description.length > 500) {
    res.status(400).json({ error: 'Invalid description' });
    return;
  }

  const result = await pool.query(
    'INSERT INTO activities (type, description, metadata) VALUES ($1, $2, $3) RETURNING *',
    [sanitizeString(type), sanitizeString(description), JSON.stringify(metadata || {})]
  );

  io.emit('activity', result.rows[0]);
  res.json(result.rows[0]);
}));

// Socket.io with authentication and rate limiting
io.use((socket: Socket, next: (err?: Error) => void) => {
  // In production, verify auth token
  if (process.env.NODE_ENV === 'production') {
    // For now, accept any connection (can add JWT later)
    // TODO: Implement proper JWT verification
  }
  next();
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
      const result = await pool.query(
        'INSERT INTO messages (sender, content) VALUES ($1, $2) RETURNING *',
        [sanitizeString(sender), sanitizeString(content)]
      );

      io.emit('message', result.rows[0]);

      // Also emit as activity for the activity feed
      const activityResult = await pool.query(
        'INSERT INTO activities (type, description, metadata) VALUES ($1, $2, $3) RETURNING *',
        ['chat', `${sender}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`, JSON.stringify({ sender, messageId: result.rows[0].id })]
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
  const commitHash = process.env.RENDER_GIT_COMMIT ||
    execSync('git rev-parse --short HEAD 2>/dev/null || echo "unknown"').toString().trim();
  return {
    version: '2.1.0',
    commit: commitHash,
    buildTime: new Date().toISOString()
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
  // Serve React app for any non-API routes
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile('client/build/index.html', { root: '.' });
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
  // Truncate tables to reset state for tests
  await pool.query('TRUNCATE TABLE kanban_tasks, kanban_columns, messages, activities RESTART IDENTITY CASCADE');
  
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
}

// Export pieces needed for integration tests (io needed for teardown so Jest can exit)
export {
  app,
  httpServer,
  io,
  pool,
  resetTestDb,
};
