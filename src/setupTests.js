require('@testing-library/jest-dom');

// Mock WebSocket for testing
global.WebSocket = jest.fn(() => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1,
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock URLSearchParams
global.URLSearchParams = jest.fn(() => ({
  get: jest.fn(),
}));

// Mock TextEncoder/TextDecoder for Node.js environment
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

// Mock database for testing
const { Pool } = require('pg');
const testDbConfig = {
  user: process.env.TEST_DB_USER || 'postgres',
  host: process.env.TEST_DB_HOST || 'localhost',
  database: process.env.TEST_DB_NAME || 'swissclaw_hub_test',
  password: process.env.TEST_DB_PASSWORD || 'password',
  port: process.env.TEST_DB_PORT || 5432,
};

const testPool = new Pool(testDbConfig);

// Test database connection
const setupTestDb = async () => {
  try {
    const client = await testPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Test database connected successfully');
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  }
};

// Test data seeding
const seedTestData = async () => {
  try {
    await testPool.query('TRUNCATE TABLE messages, activities, kanban_tasks CASCADE');
    await testPool.query('INSERT INTO users (id, email, name, role) VALUES (\'test-user-1\', \'test@example.com\', \'Test User\', \'user\')');
    await testPool.query('INSERT INTO kanban_tasks (id, title, description, status, priority, assigned_to, column, tags, created_at) VALUES (\'task-1\', \'Test Task 1\', \'Description for test task 1\', \'todo\', \'high\', \'swissclaw\', \'todo\', ARRAY[\'testing\', \'infrastructure\'])');
    await testPool.query('INSERT INTO messages (id, sender_id, content, created_at) VALUES (\'msg-1\', \'test-user-1\', \'Test message 1\', NOW())');
    console.log('Test data seeded successfully');
  } catch (error) {
    console.error('Error seeding test data:', error);
    throw error;
  }
};

// Cleanup test database
const teardownTestDb = async () => {
  try {
    await testPool.query('TRUNCATE TABLE messages, activities, kanban_tasks CASCADE');
    await testPool.end();
    console.log('Test database cleaned up successfully');
  } catch (error) {
    console.error('Error cleaning up test database:', error);
    throw error;
  }
};

module.exports = {
  testPool,
  setupTestDb,
  seedTestData,
  teardownTestDb,
  testDbConfig,
};
