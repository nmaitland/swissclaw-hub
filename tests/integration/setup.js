const { pool } = require('../../server/index');

// Setup and teardown functions
const setupTestDb = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('Test database setup completed');
  } catch (error) {
    console.error('Error setting up test database:', error.message);
    throw error;
  }
};

const teardownTestDb = async () => {
  try {
    await pool.end();
    console.log('Test database teardown completed');
  } catch (error) {
    console.error('Error tearing down test database:', error.message);
  }
};

// Seed test data using raw SQL
const seedTestData = async () => {
  try {
    // Clean up existing test data
    await pool.query('TRUNCATE TABLE activities, messages, kanban_tasks, users CASCADE');

    // Seed users
    await pool.query(`
      INSERT INTO users (id, email, name, role) VALUES
        ('550e8400-e29b-41d4-a716-446655440000', 'test@example.com', 'Test User', 'user'),
        ('550e8400-e29b-41d4-a716-446655440001', 'neil@example.com', 'Neil', 'admin')
      ON CONFLICT (id) DO NOTHING
    `);

    // Seed kanban tasks
    await pool.query(`
      INSERT INTO kanban_tasks (id, title, description, status, priority, assigned_to, "column", created_by) VALUES
        ('550e8400-e29b-41d4-a716-446655440010', 'Test Task 1', 'Description for test task 1', 'todo', 'high', 'swissclaw', 'todo', '550e8400-e29b-41d4-a716-446655440001'),
        ('550e8400-e29b-41d4-a716-446655440011', 'Test Task 2', 'Description for test task 2', 'inprogress', 'medium', 'neil', 'inprogress', '550e8400-e29b-41d4-a716-446655440001')
      ON CONFLICT (id) DO NOTHING
    `);

    // Seed messages
    await pool.query(`
      INSERT INTO messages (id, sender_id, content, type, created_at) VALUES
        ('550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440000', 'Hello from test user', 'info', NOW()),
        ('550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440001', 'Hello from admin', 'info', NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    // Seed activities
    await pool.query(`
      INSERT INTO activities (id, user_id, action, details, created_at) VALUES
        ('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440000', 'login', '{"message": "Test user logged in"}', NOW()),
        ('550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440001', 'login', '{"message": "Admin logged in"}', NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    console.log('Test data seeded successfully');
  } catch (error) {
    console.error('Error seeding test data:', error.message);
    throw error;
  }
};

// Clean test data
const cleanTestData = async () => {
  try {
    await pool.query('TRUNCATE TABLE activities, messages, kanban_tasks, users CASCADE');
    console.log('Test data cleaned successfully');
  } catch (error) {
    console.error('Error cleaning test data:', error.message);
  }
};

module.exports = {
  pool,
  setupTestDb,
  teardownTestDb,
  seedTestData,
  cleanTestData
};
