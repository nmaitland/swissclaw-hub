const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const logger = require('./lib/logger');
const { asyncHandler, errorHandler } = require('./lib/errors');

const app = express();
const httpServer = createServer(app);

// Security: Session-based authentication
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'changeme123';

// Simple session store (in-memory, cleared on restart)
const sessions = new Set();

// Auth middleware
const requireAuth = (req, res, next) => {
  // Public endpoints that don't require auth
  // When mounted at /api, req.path is relative (e.g., /kanban not /api/kanban)
  const publicApiPaths = ['/login', '/build', '/kanban', '/tasks', '/seed'];
  const publicRootPaths = ['/health', '/login'];

  if (publicApiPaths.includes(req.path) || publicRootPaths.includes(req.path)) {
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Authentication required', loginUrl: '/login' });
  }

  next();
};

// Serve login page (defined before body parser, uses raw HTML)
app.get('/login', (req, res) => {
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
        <h1>🦀 Swissclaw Hub</h1>
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
function getConnectionString() {
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

// Login endpoint (after body parser so req.body is available)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = Math.random().toString(36).substring(2);
  sessions.add(token);
  res.json({ token, success: true });
});

// Service token auth middleware
const SWISSCLAW_TOKEN = process.env.SWISSCLAW_TOKEN || 'dev-token-change-in-production';

// Service-authenticated activities endpoint (PUBLIC - before auth middleware)
app.post('/api/service/activities', asyncHandler(async (req, res) => {
  const serviceToken = req.headers['x-service-token'];
  if (serviceToken !== SWISSCLAW_TOKEN) {
    return res.status(401).json({ error: 'Invalid service token' });
  }

  const { type, description, metadata } = req.body;

  if (!type || !description) {
    return res.status(400).json({ error: 'Type and description required' });
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
    setHeaders: (res, path) => {
      // Never cache index.html - it references the hashed assets
      if (path.endsWith('index.html')) {
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

// Service token auth for SwissClaw activities
const serviceAuth = (req, res, next) => {
  const token = req.headers['x-service-token'];
  if (token === SWISSCLAW_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'Invalid service token' });
};

// Input validation helpers
const validateMessage = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (!data.sender || typeof data.sender !== 'string') return false;
  if (!data.content || typeof data.content !== 'string') return false;
  if (data.content.length > 5000) return false; // Max 5000 chars
  if (data.sender.length > 50) return false; // Max 50 chars
  return true;
};

const sanitizeString = (str) => {
  return str.replace(/[<>]/g, ''); // Basic XSS prevention
};

// Generate task ID like TASK-001
const generateTaskId = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `TASK-${timestamp.slice(-3)}${Math.floor(Math.random() * 900 + 100)}`;
};

// Database migration - add missing columns to existing tables
async function migrateDb() {
  logger.info('Starting database migration');
  try {
    logger.debug('Running database migrations...');

    // Check if kanban_columns table exists
    logger.debug('Checking if kanban_columns table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'kanban_columns'
      )
    `);
    
    logger.debug({ exists: tableCheck.rows[0].exists }, 'Table check result');

    if (tableCheck.rows[0].exists) {
      logger.debug('kanban_columns table exists, checking for missing columns...');
      // Check and add missing columns to kanban_columns
      const columnsToCheck = [
        { name: 'color', type: 'VARCHAR(20) DEFAULT \'\'' },
        { name: 'position', type: 'INTEGER DEFAULT 0' }
      ];
      
      for (const col of columnsToCheck) {
        try {
          const colCheck = await pool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_name = 'kanban_columns' AND column_name = $1
            )
          `, [col.name]);
          
          if (!colCheck.rows[0].exists) {
            logger.debug({ column: col.name }, 'Adding column to kanban_columns');
            await pool.query(`ALTER TABLE kanban_columns ADD COLUMN ${col.name} ${col.type}`);
            logger.debug({ column: col.name }, 'Successfully added column');
          } else {
            logger.debug({ column: col.name }, 'Column already exists in kanban_columns');
          }
        } catch (colErr) {
          logger.error({ err: colErr, column: col.name }, 'Error adding column to kanban_columns');
          throw colErr;
        }
      }
      
      // Check and add missing columns to kanban_tasks
      logger.debug('Checking kanban_tasks columns...');
      const taskColumnsToCheck = [
        { name: 'task_id', type: 'VARCHAR(20) UNIQUE' },
        { name: 'assigned_to', type: 'VARCHAR(50)' },
        { name: 'tags', type: 'JSONB DEFAULT \'[]\'' },
        { name: 'attachment_count', type: 'INTEGER DEFAULT 0' },
        { name: 'comment_count', type: 'INTEGER DEFAULT 0' }
      ];
      
      for (const col of taskColumnsToCheck) {
        try {
          const colCheck = await pool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_name = 'kanban_tasks' AND column_name = $1
            )
          `, [col.name]);
          
          if (!colCheck.rows[0].exists) {
            logger.debug({ column: col.name }, 'Adding column to kanban_tasks');
            await pool.query(`ALTER TABLE kanban_tasks ADD COLUMN ${col.name} ${col.type}`);
            logger.debug({ column: col.name }, 'Successfully added column');
          } else {
            logger.debug({ column: col.name }, 'Column already exists in kanban_tasks');
          }
        } catch (colErr) {
          logger.error({ err: colErr, column: col.name }, 'Error adding column to kanban_tasks');
          throw colErr;
        }
      }
      
      // Update existing columns with default values
      logger.debug('Updating column constraints...');
      try {
        await pool.query(`ALTER TABLE kanban_columns ALTER COLUMN display_name SET NOT NULL`);
        logger.debug('Set display_name NOT NULL');
      } catch (e) {
        logger.debug({ err: e }, 'display_name NOT NULL constraint already set or skipped');
      }
      try {
        await pool.query(`ALTER TABLE kanban_tasks ALTER COLUMN priority SET DEFAULT 'medium'`);
        logger.debug('Set priority DEFAULT');
      } catch (e) {
        logger.debug({ err: e }, 'priority DEFAULT already set or skipped');
      }
      try {
        await pool.query(`ALTER TABLE kanban_tasks ALTER COLUMN position SET DEFAULT 0`);
        logger.debug('Set position DEFAULT');
      } catch (e) {
        logger.debug({ err: e }, 'position DEFAULT already set or skipped');
      }
      
      // Migrate existing tasks to have task_id if missing
      try {
        logger.debug('Checking for tasks without task_id...');
        const tasksWithoutId = await pool.query(`
          SELECT id FROM kanban_tasks WHERE task_id IS NULL
        `);

        logger.debug({ count: tasksWithoutId.rows.length }, 'Tasks without task_id');
        
        for (const task of tasksWithoutId.rows) {
          const newTaskId = generateTaskId();
          await pool.query(`
            UPDATE kanban_tasks SET task_id = $1 WHERE id = $2
          `, [newTaskId, task.id]);
        }
        
        if (tasksWithoutId.rows.length > 0) {
          logger.info({ count: tasksWithoutId.rows.length }, 'Migrated existing tasks with new task_id');
        }
      } catch (migrateErr) {
        logger.error({ err: migrateErr }, 'Error migrating task_ids');
        throw migrateErr;
      }
    } else {
      logger.debug('kanban_columns table does not exist yet, skipping column migration');
    }

    logger.info('Database migrations completed successfully');
  } catch (err) {
    logger.error({ err }, 'Database migration failed');
    throw err; // Re-throw so caller can handle
  }
}

// Initialize database tables
async function initDb() {
  logger.info('Initializing database');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Kanban tables - updated schema for 6-column kanban
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kanban_columns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL,
        emoji VARCHAR(10) DEFAULT '',
        color VARCHAR(20) DEFAULT '',
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS kanban_tasks (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(20) UNIQUE,
        column_id INTEGER REFERENCES kanban_columns(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        priority VARCHAR(20) DEFAULT 'medium',
        assigned_to VARCHAR(50),
        tags JSONB DEFAULT '[]',
        attachment_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default columns if they don't exist (6 columns for new kanban)
    await pool.query(`
      INSERT INTO kanban_columns (name, display_name, emoji, color, position)
      VALUES
        ('backlog', 'Backlog', '📝', '#6b7280', 0),
        ('todo', 'To Do', '📋', '#3b82f6', 1),
        ('inProgress', 'In Progress', '🚀', '#f59e0b', 2),
        ('review', 'Review', '👀', '#8b5cf6', 3),
        ('done', 'Done', '✅', '#10b981', 4),
        ('waiting-for-neil', 'Waiting for Neil', '⏸️', '#ef4444', 5)
      ON CONFLICT (name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        emoji = EXCLUDED.emoji,
        color = EXCLUDED.color,
        position = EXCLUDED.position
    `);
    
    // Migrate existing tables to new schema
    logger.debug('Calling migrateDb() from initDb()...');
    try {
      await migrateDb();
      logger.debug('migrateDb() completed successfully');
    } catch (migrateErr) {
      logger.error({ err: migrateErr }, 'migrateDb() failed');
      // Don't throw - allow server to start even if migration fails
    }
    
    // Create index for performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_kanban_tasks_column_id ON kanban_tasks(column_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_kanban_tasks_position ON kanban_tasks(position)`);
    
    logger.info('Database tables initialized');
  } catch (err) {
    logger.error({ err }, 'Database init error');
  }
}

// API Routes
app.get('/api/status', asyncHandler(async (req, res) => {
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

app.get('/api/messages', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM messages ORDER BY created_at DESC LIMIT 50'
  );
  res.json(result.rows);
}));

// Kanban API - database backed with new 6-column schema
app.get('/api/kanban', asyncHandler(async (req, res) => {
  // Get all columns with their tasks
  const columnsResult = await pool.query(
    'SELECT * FROM kanban_columns ORDER BY position'
  );

  const kanban = {};

  for (const column of columnsResult.rows) {
    const tasksResult = await pool.query(
      `SELECT id, task_id, title, description, priority, assigned_to, tags,
              attachment_count, comment_count, position, created_at, updated_at
       FROM kanban_tasks
       WHERE column_id = $1
       ORDER BY position`,
      [column.id]
    );

    kanban[column.name] = tasksResult.rows.map(task => ({
      id: task.id,
      taskId: task.task_id || `TASK-${task.id.toString().padStart(3, '0')}`,
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
  const columns = columnsResult.rows.map(col => ({
    name: col.name,
    displayName: col.display_name,
    emoji: col.emoji,
    color: col.color,
    position: col.position
  }));

  res.json({ columns, tasks: kanban });
}));

// Create new kanban task
app.post('/api/kanban/tasks', asyncHandler(async (req, res) => {
  const { columnName, title, description, priority = 'medium', assignedTo, tags = [] } = req.body;

  if (!columnName || !title) {
    return res.status(400).json({ error: 'Column name and title required' });
  }

  // Get column id
  const columnResult = await pool.query(
    'SELECT id FROM kanban_columns WHERE name = $1',
    [columnName]
  );

  if (columnResult.rows.length === 0) {
    return res.status(404).json({ error: 'Column not found' });
  }

  const columnId = columnResult.rows[0].id;

  // Get max position for this column
  const posResult = await pool.query(
    'SELECT MAX(position) as max_pos FROM kanban_tasks WHERE column_id = $1',
    [columnId]
  );

  const position = (posResult.rows[0].max_pos || 0) + 1;
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

// Update kanban task (move columns, edit, etc)
app.put('/api/kanban/tasks/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { columnName, title, description, priority, assignedTo, tags, position } = req.body;

  let columnId = null;
  if (columnName) {
    const columnResult = await pool.query(
      'SELECT id FROM kanban_columns WHERE name = $1',
      [columnName]
    );
    if (columnResult.rows.length > 0) {
      columnId = columnResult.rows[0].id;
    }
  }

  const updates = [];
  const values = [];
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
    return res.status(404).json({ error: 'Task not found' });
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

// Delete kanban task
app.delete('/api/kanban/tasks/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    'DELETE FROM kanban_tasks WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({ success: true, deleted: result.rows[0] });
}));

// Tasks API - Neil's action items from kanban.md
function parseTasksFromKanban() {
  try {
    // Try multiple paths to find kanban.md
    const possiblePaths = [
      path.join(process.cwd(), '..', '..', 'kanban', 'kanban.md'),
      path.join(process.cwd(), '..', 'kanban', 'kanban.md'),
      path.join('/home/neil/.openclaw/workspace', 'kanban', 'kanban.md'),
      '/opt/render/project/src/kanban/kanban.md'
    ];
    
    let kanbanPath = null;
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
    
    const tasks = [];
    let inActionItems = false;
    let id = 1;
    
    content.split('\n').forEach(line => {
      if (line.includes('## 👤 Neil\'s Action Items')) {
        inActionItems = true;
      } else if (line.startsWith('## ')) {
        inActionItems = false;
      } else if (inActionItems && line.trim().startsWith('- [ ]')) {
        // Parse checkbox items: - [ ] **Title** — description
        const match = line.match(/^- \[ \] \*\*(.+?)\*\*\s*[-—]\s*(.+)$/);
        if (match) {
          tasks.push({
            id: id++,
            title: match[1].trim(),
            description: match[2].trim(),
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
              title: simpleMatch[1].trim(),
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

app.get('/api/tasks', asyncHandler(async (req, res) => {
  const tasks = parseTasksFromKanban();
  res.json(tasks);
}));

app.post('/api/activities', asyncHandler(async (req, res) => {
  const { type, description, metadata } = req.body;

  // Validation
  if (!type || typeof type !== 'string' || type.length > 50) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  if (!description || typeof description !== 'string' || description.length > 500) {
    return res.status(400).json({ error: 'Invalid description' });
  }

  const result = await pool.query(
    'INSERT INTO activities (type, description, metadata) VALUES ($1, $2, $3) RETURNING *',
    [sanitizeString(type), sanitizeString(description), JSON.stringify(metadata || {})]
  );

  io.emit('activity', result.rows[0]);
  res.json(result.rows[0]);
}));

// Socket.io with authentication and rate limiting
io.use((socket, next) => {
  // In production, verify auth token
  if (process.env.NODE_ENV === 'production') {
    const token = socket.handshake.auth.token;
    // For now, accept any connection (can add JWT later)
    // TODO: Implement proper JWT verification
  }
  next();
});

const messageRateLimits = new Map();

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');
  
  // Rate limit per socket
  messageRateLimits.set(socket.id, { count: 0, lastReset: Date.now() });
  
  socket.on('message', async (data) => {
    try {
      // Rate limiting
      const limit = messageRateLimits.get(socket.id);
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
const getBuildInfo = () => {
  const commitHash = process.env.RENDER_GIT_COMMIT || 
    require('child_process').execSync('git rev-parse --short HEAD 2>/dev/null || echo "unknown"').toString().trim();
  return {
    version: '2.1.0',
    commit: commitHash,
    buildTime: new Date().toISOString()
  };
};

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    ...getBuildInfo()
  });
});

// Build info endpoint
app.get('/api/build', (req, res) => {
  res.json(getBuildInfo());
});

// Seed endpoint - populate initial kanban data (idempotent)
app.post('/api/seed', asyncHandler(async (req, res) => {
  // Check if we already have tasks
  const existing = await pool.query('SELECT COUNT(*) as count FROM kanban_tasks');
  if (existing.rows[0].count > 0) {
    return res.json({ message: 'Already seeded', count: existing.rows[0].count });
  }

    // Get column IDs
    const columns = await pool.query('SELECT id, name FROM kanban_columns');
    const columnMap = {};
    columns.rows.forEach(c => columnMap[c.name] = c.id);

    // Seed Backlog tasks
    const backlogTasks = [
      { title: 'Zwift integration', description: 'Credentials now available in 1Password. Scope: pull ride stats, achievements, level progress', priority: 'medium', tags: ['integration', 'fitness'] },
      { title: 'CV match score calculator', description: 'Rate job postings 1-10 based on CV keyword overlap', priority: 'medium', tags: ['ai', 'jobs'] },
      { title: 'PDF Morning Report', description: 'Create PDF version of daily morning report, save to Google Drive', priority: 'low', tags: ['automation', 'reports'] }
    ];

    for (let i = 0; i < backlogTasks.length; i++) {
      await pool.query(
        'INSERT INTO kanban_tasks (task_id, column_id, title, description, priority, tags, position) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [generateTaskId(), columnMap['backlog'], backlogTasks[i].title, backlogTasks[i].description, backlogTasks[i].priority, JSON.stringify(backlogTasks[i].tags), i]
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
        [generateTaskId(), columnMap['done'], doneTasks[i].title, doneTasks[i].description, doneTasks[i].priority, i]
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
  // Manual migration endpoint with service token auth
  app.get('/api/migrate', asyncHandler(async (req, res) => {
    // Check service token
    const serviceToken = req.headers['x-service-token'];
    if (serviceToken !== SWISSCLAW_TOKEN) {
      return res.status(401).json({ error: 'Invalid service token' });
    }

    logger.info('Manual migration triggered via API');
    await migrateDb();
    res.json({ success: true, message: 'Migration completed' });
  }));

  // Serve React app for any non-API routes
  app.get('*', (req, res) => {
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
  initDb().then(() => {
    httpServer.listen(PORT, () => {
      logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'Swissclaw Hub server running');
    });
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

// For integration tests: ensure DB has server schema (drops conflicting tables from init.sql/Sequelize)
async function resetTestDb() {
  await pool.query('DROP TABLE IF EXISTS kanban_tasks CASCADE');
  await pool.query('DROP TABLE IF EXISTS kanban_columns CASCADE');
  await pool.query('DROP TABLE IF EXISTS messages CASCADE');
  await pool.query('DROP TABLE IF EXISTS activities CASCADE');
  await initDb();
}

// Export pieces needed for integration tests (io needed for teardown so Jest can exit)
module.exports = {
  app,
  httpServer,
  io,
  pool,
  initDb,
  resetTestDb,
};
