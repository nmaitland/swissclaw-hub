const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import modular components
const { 
  pool, 
  initializeDatabase, 
  checkDatabaseHealth,
  cleanupExpiredSessions,
  cleanupOldSecurityLogs 
} = require('./config/database');
const { SessionStore } = require('./middleware/auth');
const {
  securityHeaders,
  generalRateLimit,
  sanitizeQuery,
  xssProtection,
  auditLogger,
  securityErrorHandler,
} = require('./middleware/security');

// Import routes
const authRoutes = require('./routes/auth');

const app = express();
const httpServer = createServer(app);

// Initialize session store
const sessionStore = new SessionStore(pool);

// Enhanced authentication middleware
const requireAuth = async (req, res, next) => {
  // Public endpoints that don't require auth
  const publicApiPaths = ['/login', '/build', '/kanban', '/tasks', '/seed', '/health'];
  const publicRootPaths = ['/health', '/login'];

  if (publicApiPaths.includes(req.path) || publicRootPaths.includes(req.path)) {
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', loginUrl: '/login' });
  }

  try {
    const session = await sessionStore.validateSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session', loginUrl: '/login' });
    }

    // Attach user info to request
    req.user = session;
    req.sessionId = session.sessionId;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Security middleware
app.use(securityHeaders);
app.use(generalRateLimit);
app.use(sanitizeQuery);
app.use(xssProtection);
app.use(auditLogger(pool));

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from client build
if (fs.existsSync(path.join(__dirname, '../client/build'))) {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
      },
      database: dbHealth,
      version: process.env.npm_package_version || '1.0.0',
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
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
          color: #ff6b6b;
          margin-top: 1rem;
          font-size: 0.9rem;
        }
        .success {
          color: #51cf66;
          margin-top: 1rem;
          font-size: 0.9rem;
        }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h1>🦀 Swissclaw Hub</h1>
        <form id="loginForm">
          <input type="email" id="email" placeholder="Email" required>
          <input type="password" id="password" placeholder="Password" required>
          <button type="submit">Login</button>
        </form>
        <div id="message"></div>
      </div>

      <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const email = document.getElementById('email').value;
          const password = document.getElementById('password').value;
          const messageDiv = document.getElementById('message');
          
          try {
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email, password }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
              localStorage.setItem('authToken', data.token);
              messageDiv.innerHTML = '<div class="success">Login successful! Redirecting...</div>';
              setTimeout(() => {
                window.location.href = '/';
              }, 1000);
            } else {
              messageDiv.innerHTML = '<div class="error">' + data.error + '</div>';
            }
          } catch (error) {
            messageDiv.innerHTML = '<div class="error">Network error. Please try again.</div>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// API routes
app.use('/api/auth', authRoutes);

// Status endpoint
app.get('/api/status', requireAuth, async (req, res) => {
  try {
    const [statusResult, messagesResult, activitiesResult] = await Promise.all([
      pool.query('SELECT * FROM status ORDER BY last_updated DESC LIMIT 1'),
      pool.query(
        'SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id ORDER BY m.created_at DESC LIMIT 10'
      ),
      pool.query(
        'SELECT a.*, u.name as user_name FROM activities a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 10'
      ),
    ]);

    const status = statusResult.rows[0] || {};
    
    res.json({
      ...status,
      recentMessages: messagesResult.rows,
      recentActivities: activitiesResult.rows,
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Kanban endpoints
app.get('/api/kanban', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM kanban_tasks ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching kanban tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/kanban', requireAuth, async (req, res) => {
  try {
    const { title, description, priority = 'medium', assigned_to, column = 'backlog', tags = [] } = req.body;
    
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await pool.query(
      `INSERT INTO kanban_tasks (id, title, description, priority, assigned_to, column, tags, created_by, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [title.trim(), description, priority, assigned_to, tags, req.user.userId]
    );
    
    // Log activity
    await pool.query(
      'INSERT INTO activities (id, type, description, user_id, metadata, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())',
      ['task_created', `Created task: ${title}`, req.user.userId, JSON.stringify({ taskId: result.rows[0].id })]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating kanban task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/kanban/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, assigned_to, column, tags } = req.body;
    
    // Get current task for activity logging
    const currentTask = await pool.query('SELECT * FROM kanban_tasks WHERE id = $1', [id]);
    if (currentTask.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const result = await pool.query(
      `UPDATE kanban_tasks 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           priority = COALESCE($3, priority),
           assigned_to = COALESCE($4, assigned_to),
           column = COALESCE($5, column),
           tags = COALESCE($6, tags),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [title, description, priority, assigned_to, column, tags, id]
    );
    
    // Log activity if column changed
    if (column && column !== currentTask.rows[0].column) {
      await pool.query(
        'INSERT INTO activities (id, type, description, user_id, metadata, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())',
        ['task_updated', `Moved task to ${column}`, req.user.userId, JSON.stringify({ taskId: id, oldColumn: currentTask.rows[0].column, newColumn: column })]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating kanban task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/kanban/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM kanban_tasks WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Log activity
    await pool.query(
      'INSERT INTO activities (id, type, description, user_id, metadata, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())',
      ['task_deleted', `Deleted task: ${result.rows[0].title}`, req.user.userId, JSON.stringify({ taskId: id, taskTitle: result.rows[0].title })]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting kanban task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Build info endpoint
app.get('/api/build', (req, res) => {
  try {
    const packageJson = require('../package.json');
    res.json({
      version: packageJson.version,
      name: packageJson.name,
      environment: process.env.NODE_ENV || 'development',
      buildTime: new Date().toISOString(),
    });
  } catch (error) {
    res.json({
      version: '1.0.0',
      name: 'swissclaw-hub',
      environment: process.env.NODE_ENV || 'development',
      buildTime: new Date().toISOString(),
    });
  }
});

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Socket authentication
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const session = await sessionStore.validateSession(token);
    if (!session) {
      return next(new Error('Invalid session'));
    }

    socket.user = session;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.user.name} connected`);

  socket.on('message', async (data) => {
    try {
      const { content } = data;
      
      if (!content || content.trim().length === 0) {
        return;
      }

      // Save message to database
      const result = await pool.query(
        'INSERT INTO messages (id, sender_id, content, created_at) VALUES (gen_random_uuid(), $1, $2, NOW()) RETURNING *',
        [socket.user.userId, content.trim()]
      );

      // Broadcast to all connected clients
      io.emit('message', {
        id: result.rows[0].id,
        content: result.rows[0].content,
        sender: {
          id: socket.user.userId,
          name: socket.user.name,
        },
        created_at: result.rows[0].created_at,
      });

      // Log activity
      await pool.query(
        'INSERT INTO activities (id, type, description, user_id, metadata, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())',
        ['message_sent', 'Sent a message', socket.user.userId, JSON.stringify({ messageId: result.rows[0].id })]
      );
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User ${socket.user.name} disconnected`);
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  const buildPath = path.join(__dirname, '../client/build/index.html');
  if (fs.existsSync(buildPath)) {
    res.sendFile(buildPath);
  } else {
    res.status(404).send('Not found');
  }
});

// Error handling middleware
app.use(securityErrorHandler);

// Start server
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Start cleanup tasks
    setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // Every hour
    setInterval(() => cleanupOldSecurityLogs(30), 24 * 60 * 60 * 1000); // Daily

    httpServer.listen(PORT, () => {
      console.log(`🦀 Swissclaw Hub server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔐 Login: http://localhost:${PORT}/login`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    pool.end(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    pool.end(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});
