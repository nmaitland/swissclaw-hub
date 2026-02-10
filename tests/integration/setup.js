const { Sequelize } = require('sequelize');

// Test database configuration
const testDbConfig = {
  database: 'swissclaw_hub_test',
  username: 'postgres',
  password: 'password',
  host: 'localhost',
  port: 5433,
  dialect: 'postgres',
  logging: false
};

// Create Sequelize instance for testing
const sequelize = new Sequelize(
  testDbConfig.database,
  testDbConfig.username,
  testDbConfig.password,
  {
    host: testDbConfig.host,
    port: testDbConfig.port,
    dialect: testDbConfig.dialect,
    logging: false
  }
);

// Import and initialize models directly for testing
const UserModel = require('../../server/models/user');
const KanbanTaskModel = require('../../server/models/kanbantask');
const MessageModel = require('../../server/models/message');
const ActivityModel = require('../../server/models/activity');

const { User } = UserModel(sequelize);
const { KanbanTask } = KanbanTaskModel(sequelize);
const { Message } = MessageModel(sequelize);
const { Activity } = ActivityModel(sequelize);

// Setup associations
User.associate({ KanbanTask, Message });
KanbanTask.associate({ User });
Message.associate({ User });

const db = {
  sequelize,
  User,
  KanbanTask,
  Message,
  Activity
};

// Setup and teardown functions
const setupTestDb = async () => {
  try {
    // Test connection first
    await sequelize.authenticate();
    
    // Don't sync database since it's already migrated
    console.log('Test database setup completed');
  } catch (error) {
    console.error('Error setting up test database:', error.message);
    throw error;
  }
};

const teardownTestDb = async () => {
  try {
    // Close database connection
    if (sequelize && !sequelize.connectionManager.isClosed) {
      await sequelize.close();
    }
    console.log('Test database teardown completed');
  } catch (error) {
    console.error('Error tearing down test database:', error.message);
  }
};

// Global cleanup to ensure Jest exits cleanly
process.on('exit', () => {
  if (sequelize && !sequelize.connectionManager.isClosed) {
    sequelize.close();
  }
});

process.on('SIGINT', () => {
  if (sequelize && !sequelize.connectionManager.isClosed) {
    sequelize.close();
  }
  process.exit(0);
});

// Seed test data
const seedTestData = async () => {
  try {
    // Clean up existing test data first using truncate for better FK handling
    await sequelize.query('TRUNCATE TABLE activities, messages, kanban_tasks, users CASCADE');
    
    // Seed users
    await db.User.bulkCreate([
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'neil@example.com',
        name: 'Neil',
        role: 'admin'
      }
    ]);

    // Seed kanban tasks
    await db.KanbanTask.bulkCreate([
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        title: 'Test Task 1',
        description: 'Description for test task 1',
        status: 'todo',
        priority: 'high',
        assigned_to: 'swissclaw',
        column: 'todo',
        created_by: '550e8400-e29b-41d4-a716-446655440001'
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440011',
        title: 'Test Task 2',
        description: 'Description for test task 2',
        status: 'inprogress',
        priority: 'medium',
        assigned_to: 'neil',
        column: 'inprogress',
        created_by: '550e8400-e29b-41d4-a716-446655440001'
      }
    ], { ignoreDuplicates: true });

    // Seed messages
    await db.Message.bulkCreate([
      {
        id: '550e8400-e29b-41d4-a716-446655440020',
        sender_id: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Hello from test user',
        type: 'info',
        created_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440021',
        sender_id: '550e8400-e29b-41d4-a716-446655440001',
        content: 'Hello from admin',
        type: 'info',
        created_at: new Date()
      }
    ], { ignoreDuplicates: true });

    // Seed activities
    await db.Activity.bulkCreate([
      {
        id: '550e8400-e29b-41d4-a716-446655440030',
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        action: 'login',
        details: { message: 'Test user logged in' },
        created_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440031',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
        action: 'login',
        details: { message: 'Admin logged in' },
        created_at: new Date()
      }
    ], { ignoreDuplicates: true });

    console.log('Test data seeded successfully');
  } catch (error) {
    console.error('Error seeding test data:', error.message);
    throw error;
  }
};

// Clean test data
const cleanTestData = async () => {
  try {
    await db.KanbanTask.destroy({ where: {}, force: true });
    await db.Message.destroy({ where: {}, force: true });
    await db.Activity.destroy({ where: {}, force: true });
    await db.User.destroy({ where: {}, force: true });
    console.log('Test data cleaned successfully');
  } catch (error) {
    console.error('Error cleaning test data:', error.message);
  }
};

module.exports = {
  sequelize,
  setupTestDb,
  teardownTestDb,
  seedTestData,
  cleanTestData,
  db,
  testDbConfig
};
