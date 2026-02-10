const { Pool } = require('pg');

// Test database configuration
const testDbConfig = {
  user: process.env.TEST_DB_USER || 'postgres',
  host: process.env.TEST_DB_HOST || 'localhost',
  database: process.env.TEST_DB_NAME || 'swissclaw_hub_test',
  password: process.env.TEST_DB_PASSWORD || 'password',
  port: process.env.TEST_DB_PORT || 5432,
};

// Create test database connection pool
const testPool = new Pool(testDbConfig);

// Setup and teardown functions
const setupTestDb = async () => {
  try {
    // Clean up test data before each test
    await testPool.query('TRUNCATE TABLE messages, activities, kanban_tasks CASCADE');
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  }
};

const teardownTestDb = async () => {
  try {
    // Clean up after tests
    await testPool.query('TRUNCATE TABLE messages, activities, kanban_tasks CASCADE');
    await testPool.end();
  } catch (error) {
    console.error('Error tearing down test database:', error);
    throw error;
  }
};

// Seed test data
const seedTestData = async () => {
  try {
    // Insert test user
    await testPool.query(`
      INSERT INTO users (id, email, name, role) 
      VALUES ('test-user-1', 'test@example.com', 'Test User', 'user')
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert test kanban tasks
    await testPool.query(`
      INSERT INTO kanban_tasks (id, title, description, status, priority, assigned_to, column)
      VALUES 
        ('task-1', 'Test Task 1', 'Description for test task 1', 'todo', 'high', 'swissclaw', 'todo'),
        ('task-2', 'Test Task 2', 'Description for test task 2', 'inprogress', 'medium', 'neil', 'inprogress'),
        ('task-3', 'Test Task 3', 'Description for test task 3', 'done', 'low', 'swissclaw', 'done')
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert test messages
    await testPool.query(`
      INSERT INTO messages (id, sender_id, content, created_at)
      VALUES 
        ('msg-1', 'test-user-1', 'Test message 1', NOW()),
        ('msg-2', 'test-user-1', 'Test message 2', NOW() - INTERVAL '1 hour')
      ON CONFLICT (id) DO NOTHING
    `);
  } catch (error) {
    console.error('Error seeding test data:', error);
    throw error;
  }
};

module.exports = {
  testPool,
  setupTestDb,
  teardownTestDb,
  seedTestData,
  testDbConfig,
};
