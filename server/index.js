const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);

// Security: Session-based authentication
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'changeme123';

// Simple session store (in-memory, cleared on restart)
const sessions = new Set();

// Auth middleware
const requireAuth = (req, res, next) => {
  // Skip auth for health check and login endpoints
  if (req.path === '/health' || req.path === '/api/login' || req.path.startsWith('/login')) {
    return next();
  }
  
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Authentication required', loginUrl: '/login' });
  }
  
  next();
};

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = Math.random().toString(36).substring(2);
  sessions.add(token);
  res.json({ token, success: true });
});

// Serve login page
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

// Apply auth in production
if (process.env.NODE_ENV === 'production') {
  app.use(requireAuth);
}

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build', {
    maxAge: '1d', // Cache static assets for 1 day
    etag: true
  }));
}

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

// Initialize database tables
async function initDb() {
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
    
    // Create index for performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC)`);
    
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Database init error:', err);
  }
}

// API Routes
app.get('/api/status', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM messages ORDER BY created_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Messages error:', err);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Kanban API - reads from kanban.md file
const fs = require('fs');
const path = require('path');

function parseKanbanMarkdown() {
  try {
    const kanbanPath = path.join(process.cwd(), '..', '..', 'kanban', 'kanban.md');
    const content = fs.readFileSync(kanbanPath, 'utf8');
    
    const kanban = {
      todo: [],
      inProgress: [],
      done: []
    };
    
    let currentSection = null;
    let taskId = 1;
    
    content.split('\n').forEach(line => {
      if (line.includes('## 📋 To Do')) {
        currentSection = 'todo';
      } else if (line.includes('## 🚀 In Progress')) {
        currentSection = 'inProgress';
      } else if (line.includes('## ✅ Done')) {
        currentSection = 'done';
      } else if (line.startsWith('## ')) {
        currentSection = null;
      } else if (currentSection && line.trim().startsWith('- **')) {
        // Parse format: - **Title** — description
        const match = line.match(/^- \*\*(.+?)\*\*\s*[-—]\s*(.+)$/);
        if (match) {
          kanban[currentSection].push({
            id: taskId++,
            title: match[1].trim(),
            description: match[2].trim()
          });
        } else {
          // Fallback: just extract between **
          const simpleMatch = line.match(/^- \*\*(.+?)\*\*/);
          if (simpleMatch) {
            kanban[currentSection].push({
              id: taskId++,
              title: simpleMatch[1].trim(),
              description: ''
            });
          }
        }
      }
    });
    
    return kanban;
  } catch (err) {
    console.error('Error parsing kanban:', err);
    return { todo: [], inProgress: [], done: [] };
  }
}

app.get('/api/kanban', async (req, res) => {
  try {
    const kanban = parseKanbanMarkdown();
    res.json(kanban);
  } catch (err) {
    console.error('Kanban error:', err);
    res.status(500).json({ error: 'Failed to get kanban' });
  }
});

// Tasks API - Neil's action items from kanban.md
function parseTasksFromKanban() {
  try {
    const kanbanPath = path.join(process.cwd(), '..', '..', 'kanban', 'kanban.md');
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
    console.error('Error parsing tasks:', err);
    return [];
  }
}

app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = parseTasksFromKanban();
    res.json(tasks);
  } catch (err) {
    console.error('Tasks error:', err);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

app.post('/api/activities', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

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
  console.log('Client connected:', socket.id);
  
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
    } catch (err) {
      console.error('Socket message error:', err);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
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

// Serve React app for any non-API routes (must be last)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile('client/build/index.html', { root: '.' });
  });
}

const PORT = process.env.PORT || 3001;

initDb().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Swissclaw Hub server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  await pool.end();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
