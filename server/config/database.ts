import { Pool, PoolClient } from 'pg';
import logger from '../lib/logger';
import type { DatabaseConfig, DatabaseHealthResult } from '../types';

// Database configuration with environment-specific settings
const getDatabaseConfig = (): DatabaseConfig => {
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
      port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
    };
  }

  return {
    ...baseConfig,
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || process.env.DATABASE_URL?.split('/').pop() || 'swissclaw_hub',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    // If DATABASE_URL is provided, parse it
    ...(process.env.DATABASE_URL && { connectionString: process.env.DATABASE_URL }),
  };
};

// Create database pool
const pool = new Pool(getDatabaseConfig());

// Database connection monitoring
pool.on('connect', (_client: PoolClient) => {
  logger.debug('New database client connected');
});

pool.on('error', (err: Error, _client: PoolClient) => {
  logger.error({ err }, 'Unexpected error on idle client');
  process.exit(-1);
});

// Database initialization - just tests the connection
// Tables are created via Sequelize migrations
const initializeDatabase = async (): Promise<void> => {
  try {
    // Test the connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to database');
    throw error;
  }
};

// Database health check
const checkDatabaseHealth = async (): Promise<DatabaseHealthResult> => {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as version');
    return {
      status: 'healthy',
      timestamp: result.rows[0]?.current_time,
      version: result.rows[0]?.version,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: (error as Error).message,
    };
  }
};

// Database cleanup functions
const cleanupExpiredSessions = async (): Promise<number> => {
  try {
    const result = await pool.query(
      'DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL'
    );
    logger.info({ count: result.rowCount }, 'Cleaned up expired sessions');
    return result.rowCount ?? 0;
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning up expired sessions');
    return 0;
  }
};

const cleanupOldSecurityLogs = async (daysToKeep = 30): Promise<number> => {
  try {
    const result = await pool.query(
      'DELETE FROM security_logs WHERE created_at < NOW() - INTERVAL $1 DAY',
      [daysToKeep]
    );
    logger.info({ count: result.rowCount }, 'Cleaned up old security logs');
    return result.rowCount ?? 0;
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning up old security logs');
    return 0;
  }
};

// Graceful shutdown
const closeDatabaseConnection = async (): Promise<void> => {
  try {
    await pool.end();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error({ err: error }, 'Error closing database connection');
  }
};

// Handle process termination
process.on('SIGINT', closeDatabaseConnection);
process.on('SIGTERM', closeDatabaseConnection);

export {
  pool,
  initializeDatabase,
  checkDatabaseHealth,
  cleanupExpiredSessions,
  cleanupOldSecurityLogs,
  closeDatabaseConnection,
  getDatabaseConfig,
};
