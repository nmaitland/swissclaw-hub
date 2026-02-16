// Mock pg before requiring the module
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();
const mockOn = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    query: mockQuery,
    connect: mockConnect,
    end: mockEnd,
    on: mockOn,
  })),
}));

describe('database config module', () => {
  let dbModule;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('getDatabaseConfig', () => {
    it('returns test config when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      process.env.TEST_DB_USER = 'testuser';
      process.env.TEST_DB_HOST = 'testhost';
      process.env.TEST_DB_NAME = 'testdb';
      process.env.TEST_DB_PASSWORD = 'testpass';
      process.env.TEST_DB_PORT = '5555';

      dbModule = require('../../server/config/database');
      const config = dbModule.getDatabaseConfig();

      expect(config.user).toBe('testuser');
      expect(config.host).toBe('testhost');
      expect(config.database).toBe('testdb');
      expect(config.password).toBe('testpass');
      expect(config.port).toBe(5555);
      expect(config.max).toBe(20);
      expect(config.idleTimeoutMillis).toBe(30000);
      expect(config.connectionTimeoutMillis).toBe(2000);

      delete process.env.TEST_DB_USER;
      delete process.env.TEST_DB_HOST;
      delete process.env.TEST_DB_NAME;
      delete process.env.TEST_DB_PASSWORD;
      delete process.env.TEST_DB_PORT;
    });

    it('returns test defaults when no env vars set', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.TEST_DB_USER;
      delete process.env.TEST_DB_HOST;
      delete process.env.TEST_DB_NAME;
      delete process.env.TEST_DB_PASSWORD;
      delete process.env.TEST_DB_PORT;

      dbModule = require('../../server/config/database');
      const config = dbModule.getDatabaseConfig();

      expect(config.user).toBe('postgres');
      expect(config.host).toBe('localhost');
      expect(config.database).toBe('swissclaw_hub_test');
      expect(config.password).toBe('password');
      expect(config.port).toBe(5433);
    });

    it('returns development config when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      process.env.DB_USER = 'devuser';
      process.env.DB_HOST = 'devhost';
      process.env.DB_NAME = 'devdb';
      process.env.DB_PASSWORD = 'devpass';
      process.env.DB_PORT = '5434';

      dbModule = require('../../server/config/database');
      const config = dbModule.getDatabaseConfig();

      expect(config.user).toBe('devuser');
      expect(config.host).toBe('devhost');
      expect(config.database).toBe('devdb');
      expect(config.password).toBe('devpass');
      expect(config.port).toBe(5434);

      delete process.env.DB_USER;
      delete process.env.DB_HOST;
      delete process.env.DB_NAME;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_PORT;
    });

    it('uses DATABASE_URL connectionString when provided', () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgres://user:pass@host:5432/mydb';
      delete process.env.DB_USER;
      delete process.env.DB_HOST;
      delete process.env.DB_NAME;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_PORT;

      dbModule = require('../../server/config/database');
      const config = dbModule.getDatabaseConfig();

      expect(config.connectionString).toBe('postgres://user:pass@host:5432/mydb');
      expect(config.database).toBe('mydb');

      delete process.env.DATABASE_URL;
    });

    it('uses POSTGRES_USER and POSTGRES_PASSWORD fallbacks', () => {
      process.env.NODE_ENV = 'development';
      process.env.POSTGRES_USER = 'pguser';
      process.env.POSTGRES_PASSWORD = 'pgpass';
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      delete process.env.DATABASE_URL;

      dbModule = require('../../server/config/database');
      const config = dbModule.getDatabaseConfig();

      expect(config.user).toBe('pguser');
      expect(config.password).toBe('pgpass');

      delete process.env.POSTGRES_USER;
      delete process.env.POSTGRES_PASSWORD;
    });
  });

  describe('checkDatabaseHealth', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      dbModule = require('../../server/config/database');
    });

    it('returns healthy status when query succeeds', async () => {
      const mockTime = new Date('2024-01-01T00:00:00Z');
      mockQuery.mockResolvedValueOnce({
        rows: [{ current_time: mockTime, version: 'PostgreSQL 15.1' }],
      });

      const result = await dbModule.checkDatabaseHealth();

      expect(result.status).toBe('healthy');
      expect(result.timestamp).toEqual(mockTime);
      expect(result.version).toBe('PostgreSQL 15.1');
    });

    it('returns unhealthy status when query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await dbModule.checkDatabaseHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('cleanupExpiredSessions', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      dbModule = require('../../server/config/database');
    });

    it('returns count of deleted sessions', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      const result = await dbModule.cleanupExpiredSessions();

      expect(result).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL'
      );
    });

    it('returns 0 when no sessions to clean', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await dbModule.cleanupExpiredSessions();

      expect(result).toBe(0);
    });

    it('returns 0 on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await dbModule.cleanupExpiredSessions();

      expect(result).toBe(0);
    });
  });

  describe('cleanupOldSecurityLogs', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      dbModule = require('../../server/config/database');
    });

    it('returns count of deleted logs with default retention', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 10 });

      const result = await dbModule.cleanupOldSecurityLogs();

      expect(result).toBe(10);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM security_logs'),
        [30]
      );
    });

    it('accepts custom retention period', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });

      const result = await dbModule.cleanupOldSecurityLogs(7);

      expect(result).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [7]
      );
    });

    it('returns 0 on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await dbModule.cleanupOldSecurityLogs();

      expect(result).toBe(0);
    });
  });

  describe('closeDatabaseConnection', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      dbModule = require('../../server/config/database');
    });

    it('calls pool.end()', async () => {
      mockEnd.mockResolvedValueOnce();

      await dbModule.closeDatabaseConnection();

      expect(mockEnd).toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockEnd.mockRejectedValueOnce(new Error('Close failed'));

      // Should not throw
      await dbModule.closeDatabaseConnection();

      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('initializeDatabase', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      dbModule = require('../../server/config/database');
    });

    it('connects and verifies database is accessible', async () => {
      const mockClient = { query: jest.fn().mockResolvedValue({}), release: jest.fn() };
      mockConnect.mockResolvedValueOnce(mockClient);
      mockQuery.mockResolvedValue({});

      await dbModule.initializeDatabase();

      expect(mockConnect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT NOW()');
      expect(mockClient.release).toHaveBeenCalled();
      // Tables are now created via Sequelize migrations, not in initializeDatabase
      expect(mockQuery).toHaveBeenCalledTimes(0);
    });

    it('throws on connection failure', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(dbModule.initializeDatabase()).rejects.toThrow('Connection failed');
    });
  });
});
