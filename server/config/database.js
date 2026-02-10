const { Pool } = require('pg');

// Database configuration with environment-specific settings
const getDatabaseConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  const baseConfig = {
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait when connecting a new client
  };

  if (env === 'test') {
    return {
      ...baseConfig,
      user: process.env.TEST_DB_USER || 'postgres',
      host: process.env.TEST_DB_HOST || 'localhost',
      database: process.env.TEST_DB_NAME || 'swissclaw_hub_test',
      password: process.env.TEST_DB_PASSWORD || 'password',
      port: process.env.TEST_DB_PORT || 5432,
    };
  }

  return {
    ...baseConfig,
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || process.env.DATABASE_URL?.split('/').pop() || 'swissclaw_hub',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
    // If DATABASE_URL is provided, parse it
    ...(process.env.DATABASE_URL && { connectionString: process.env.DATABASE_URL }),
  };
};

// Create database pool
const pool = new Pool(getDatabaseConfig());

// Database connection monitoring
pool.on('connect', (client) => {
  console.log('New database client connected');
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Database initialization
const initializeDatabase = async () => {
  try {
    // Test the connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Database connected successfully');

    // Create tables if they don't exist
    await createTables();
    
    // Create indexes
    await createIndexes();
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};

// Create database tables
const createTables = async () => {
  const tables = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_login TIMESTAMP WITH TIME ZONE
    )`,

    // Sessions table
    `CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      user_agent TEXT,
      ip_address INET,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      revoked_at TIMESTAMP WITH TIME ZONE
    )`,

    // Status table
    `CREATE TABLE IF NOT EXISTS status (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      status VARCHAR(100) NOT NULL,
      current_task TEXT,
      last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,

    // Kanban tasks table (updated for new kanban system)
    `CREATE TABLE IF NOT EXISTS kanban_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'todo',
      priority VARCHAR(10) DEFAULT 'medium',
      assigned_to VARCHAR(50),
      column VARCHAR(50) DEFAULT 'backlog',
      tags TEXT[] DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by UUID REFERENCES users(id)
    )`,

    // Messages table
    `CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id UUID REFERENCES users(id),
      content TEXT NOT NULL,
      attachments JSONB DEFAULT '[]',
      thread_id UUID REFERENCES messages(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      read_at TIMESTAMP WITH TIME ZONE
    )`,

    // Activities table
    `CREATE TABLE IF NOT EXISTS activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      user_id UUID REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,

    // Security logs table
    `CREATE TABLE IF NOT EXISTS security_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(50) NOT NULL,
      method VARCHAR(10),
      path VARCHAR(255),
      status_code INTEGER,
      ip_address INET,
      user_agent TEXT,
      user_id UUID REFERENCES users(id),
      duration INTEGER,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
  ];

  for (const table of tables) {
    await pool.query(table);
  }
};

// Create database indexes for performance
const createIndexes = async () => {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_kanban_tasks_column ON kanban_tasks(column)',
    'CREATE INDEX IF NOT EXISTS idx_kanban_tasks_assigned_to ON kanban_tasks(assigned_to)',
    'CREATE INDEX IF NOT EXISTS idx_kanban_tasks_priority ON kanban_tasks(priority)',
    'CREATE INDEX IF NOT EXISTS idx_kanban_tasks_status ON kanban_tasks(status)',
    'CREATE INDEX IF NOT EXISTS idx_kanban_tasks_created_at ON kanban_tasks(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)',
    'CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type)',
    'CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_security_logs_type ON security_logs(type)',
    'CREATE INDEX IF NOT EXISTS idx_security_logs_user_id ON security_logs(user_id)',
  ];

  for (const index of indexes) {
    await pool.query(index);
  }
};

// Database health check
const checkDatabaseHealth = async () => {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as version');
    return {
      status: 'healthy',
      timestamp: result.rows[0].current_time,
      version: result.rows[0].version,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
    };
  }
};

// Database cleanup functions
const cleanupExpiredSessions = async () => {
  try {
    const result = await pool.query(
      'DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL'
    );
    console.log(`Cleaned up ${result.rowCount} expired sessions`);
    return result.rowCount;
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return 0;
  }
};

const cleanupOldSecurityLogs = async (daysToKeep = 30) => {
  try {
    const result = await pool.query(
      'DELETE FROM security_logs WHERE created_at < NOW() - INTERVAL $1 DAY',
      [daysToKeep]
    );
    console.log(`Cleaned up ${result.rowCount} old security logs`);
    return result.rowCount;
  } catch (error) {
    console.error('Error cleaning up old security logs:', error);
    return 0;
  }
};

// Graceful shutdown
const closeDatabaseConnection = async () => {
  try {
    await pool.end();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
};

// Handle process termination
process.on('SIGINT', closeDatabaseConnection);
process.on('SIGTERM', closeDatabaseConnection);

module.exports = {
  pool,
  initializeDatabase,
  checkDatabaseHealth,
  cleanupExpiredSessions,
  cleanupOldSecurityLogs,
  closeDatabaseConnection,
  getDatabaseConfig,
};
