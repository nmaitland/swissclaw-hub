const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build'));
}

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
    
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Database init error:', err);
  }
}

// API Routes
app.get('/api/status', async (req, res) => {
  try {
    // Get recent messages
    const messagesResult = await pool.query(
      'SELECT * FROM messages ORDER BY created_at DESC LIMIT 10'
    );
    
    // Get recent activities
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

app.post('/api/activities', async (req, res) => {
  try {
    const { type, description, metadata } = req.body;
    const result = await pool.query(
      'INSERT INTO activities (type, description, metadata) VALUES ($1, $2, $3) RETURNING *',
      [type, description, JSON.stringify(metadata || {})]
    );
    
    // Broadcast to all connected clients
    io.emit('activity', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

// Socket.io for real-time chat
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('message', async (data) => {
    try {
      const { sender, content } = data;
      const result = await pool.query(
        'INSERT INTO messages (sender, content) VALUES ($1, $2) RETURNING *',
        [sender, content]
      );
      
      // Broadcast to all clients
      io.emit('message', result.rows[0]);
    } catch (err) {
      console.error('Socket message error:', err);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
  });
});
