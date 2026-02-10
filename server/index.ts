import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Import modular components
import { initializeDatabase, checkDatabaseHealth, cleanupExpiredSessions, cleanupOldSecurityLogs } from './config/database';
import { SessionStore } from './middleware/auth';
import { 
  securityHeaders, 
  generalRateLimit, 
  sanitizeQuery, 
  xssProtection, 
  auditLogger, 
  securityErrorHandler 
} from './middleware/security';
import authRoutes from './routes/auth';

// Load environment variables
dotenv.config();

// Type definitions
interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    name: string;
    role: string;
    sessionId: string;
  };
  sessionId: string;
}

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(securityHeaders);
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(generalRateLimit);
app.use(sanitizeQuery);
app.use(xssProtection);

// Initialize database and session store
let sessionStore: SessionStore;
let dbPool: any;

// Initialize application
const initializeApp = async () => {
  try {
    // Import and initialize database
    const { pool } = await import('./config/database');
    dbPool = pool;
    
    await initializeDatabase();
    console.log('Database initialized successfully');
    
    sessionStore = new SessionStore(dbPool);
    console.log('Session store initialized');
    
    // Start cleanup jobs
    setInterval(() => {
      cleanupExpiredSessions();
      cleanupOldSecurityLogs();
    }, 60 * 60 * 1000); // Run every hour
    
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
};

// Authentication middleware
const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const user = await sessionStore.validateSession(token);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).sessionId = user.sessionId;
    next();
    return;
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
    return;
  }
};

// Apply audit logging and security error handling
app.use(auditLogger(dbPool));
app.use(securityErrorHandler);

// Routes
app.use('/auth', authRoutes);

// Health check endpoint
app.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const dbHealth = await checkDatabaseHealth();
    
    if (!dbHealth) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Database health check failed'
      });
      return;
    }
    
    const health = {
      status: dbHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
      },
      database: dbHealth,
      version: process.env.npm_package_version || '1.0.0'
    };

    res.status(dbHealth.status === 'healthy' ? 200 : 503).json(health);
    return;
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: (error as Error).message
    });
    return;
  }
});

// API Routes
app.get('/api/status', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbPool.query(
      'SELECT * FROM status ORDER BY last_updated DESC LIMIT 10'
    );
    res.json(result.rows);
    return;
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
    return;
  }
});

app.post('/api/status', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, current_task } = req.body;
    
    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    const result = await dbPool.query(
      'INSERT INTO status (id, status, current_task, last_updated) VALUES (gen_random_uuid(), $1, $2, NOW()) RETURNING *',
      [status, current_task || null]
    );

    // Broadcast to all connected clients
    io.emit('statusUpdate', result.rows[0]);

    res.json(result.rows[0]);
    return;
  } catch (error) {
    console.error('Error creating status:', error);
    res.status(500).json({ error: 'Failed to create status' });
    return;
  }
});

// Kanban API routes
app.get('/api/kanban', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbPool.query(
      'SELECT * FROM kanban_tasks ORDER BY created_at DESC'
    );
    res.json(result.rows);
    return;
  } catch (error) {
    console.error('Error fetching kanban tasks:', error);
    res.status(500).json({ error: 'Failed to fetch kanban tasks' });
    return;
  }
});

app.post('/api/kanban', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, priority = 'medium', assigned_to, column = 'backlog', tags = [] } = req.body;
    
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const result = await dbPool.query(
      `INSERT INTO kanban_tasks (id, title, description, priority, assigned_to, column, tags, created_at, updated_at, created_by) 
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW(), $7) RETURNING *`,
      [title, description || null, priority, assigned_to || null, column, tags, (req as AuthenticatedRequest).user.userId]
    );

    // Broadcast to all connected clients
    io.emit('kanbanUpdate', { type: 'created', task: result.rows[0] });

    res.json(result.rows[0]);
    return;
  } catch (error) {
    console.error('Error creating kanban task:', error);
    res.status(500).json({ error: 'Failed to create kanban task' });
    return;
  }
});

app.put('/api/kanban/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, priority, assigned_to, column, tags } = req.body;
    
    const result = await dbPool.query(
      `UPDATE kanban_tasks 
       SET title = COALESCE($1, title), 
           description = COALESCE($2, description), 
           priority = COALESCE($3, priority), 
           assigned_to = COALESCE($4, assigned_to), 
           column = COALESCE($5, column), 
           tags = COALESCE($6, tags),
           updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title, description, priority, assigned_to, column, tags, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Broadcast to all connected clients
    io.emit('kanbanUpdate', { type: 'updated', task: result.rows[0] });

    res.json(result.rows[0]);
    return;
  } catch (error) {
    console.error('Error updating kanban task:', error);
    res.status(500).json({ error: 'Failed to update kanban task' });
    return;
  }
});

app.delete('/api/kanban/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const result = await dbPool.query(
      'DELETE FROM kanban_tasks WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Broadcast to all connected clients
    io.emit('kanbanUpdate', { type: 'deleted', taskId: id });

    res.json({ message: 'Task deleted successfully' });
    return;
  } catch (error) {
    console.error('Error deleting kanban task:', error);
    res.status(500).json({ error: 'Failed to delete kanban task' });
    return;
  }
});

// Messages API
app.get('/api/messages', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbPool.query(
      'SELECT * FROM messages ORDER BY created_at DESC LIMIT 50'
    );
    res.json(result.rows);
    return;
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
    return;
  }
});

app.post('/api/messages', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, attachments = [] } = req.body;
    
    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const result = await dbPool.query(
      'INSERT INTO messages (id, sender_id, content, attachments, created_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW()) RETURNING *',
      [(req as AuthenticatedRequest).user.userId, content, JSON.stringify(attachments)]
    );

    // Broadcast to all connected clients
    io.emit('newMessage', result.rows[0]);

    res.json(result.rows[0]);
    return;
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Failed to create message' });
    return;
  }
});

// Activities API
app.get('/api/activities', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbPool.query(
      'SELECT * FROM activities ORDER BY created_at DESC LIMIT 20'
    );
    res.json(result.rows);
    return;
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
    return;
  }
});

// Socket.IO connection handling
const connectedUsers = new Map<string, any>();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const user = await sessionStore.validateSession(token);
    if (!user) {
      return next(new Error('Invalid or expired token'));
    }

    socket.data.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  console.log(`User ${user.name} connected`);

  // Store user connection
  connectedUsers.set(socket.id, {
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionId: user.sessionId
  });

  // Broadcast user count
  io.emit('userCount', connectedUsers.size);

  // Handle chat messages
  socket.on('chatMessage', async (data) => {
    try {
      const { content } = data;
      
      if (!content) {
        socket.emit('error', { message: 'Message content is required' });
        return;
      }

      const result = await dbPool.query(
        'INSERT INTO messages (id, sender_id, content, attachments, created_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW()) RETURNING *',
        [user.userId, content, JSON.stringify([])]
      );

      const message = result.rows[0];
      message.sender = {
        id: user.userId,
        name: user.name
      };

      // Broadcast to all connected clients
      io.emit('newMessage', message);
    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle kanban updates
  socket.on('kanbanUpdate', async (data) => {
    try {
      const { type, task } = data;
      
      if (type === 'move') {
        await dbPool.query(
          'UPDATE kanban_tasks SET column = $1, updated_at = NOW() WHERE id = $2',
          [task.column, task.id]
        );
      }

      // Broadcast to all connected clients
      io.emit('kanbanUpdate', data);
    } catch (error) {
      console.error('Error handling kanban update:', error);
      socket.emit('error', { message: 'Failed to update kanban' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User ${user.name} disconnected`);
    connectedUsers.delete(socket.id);
    io.emit('userCount', connectedUsers.size);
  });
});

// Start server
initializeApp().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    if (dbPool) {
      await dbPool.end();
      console.log('Database connection closed');
    }
    
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    if (dbPool) {
      await dbPool.end();
      console.log('Database connection closed');
    }
    
    process.exit(0);
  });
});

export default app;
