const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance only if config exists
const sequelize = dbConfig ? new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging
  }
) : null;

// Import models
const UserModel = require('./user');
const KanbanTaskModel = require('./kanbantask');
const MessageModel = require('./message');
const ActivityModel = require('./activity');
const SecurityLogModel = require('./securitylog');

// Setup associations
const setupAssociations = () => {
  if (!sequelize) {
    // Return empty models when no sequelize instance
    return {
      User: null,
      KanbanTask: null,
      Message: null,
      Activity: null,
      SecurityLog: null
    };
  }
  
  const User = UserModel(sequelize).User;
  const KanbanTask = KanbanTaskModel(sequelize).KanbanTask;
  const Message = MessageModel(sequelize).Message;
  const Activity = ActivityModel(sequelize).Activity;
  const SecurityLog = SecurityLogModel(sequelize).SecurityLog;

  User.associate({ KanbanTask, Message, Activity, SecurityLog });
  KanbanTask.associate({ User });
  Message.associate({ User });
  Activity.associate({ User });
  SecurityLog.associate({ User });

  return {
    User,
    KanbanTask,
    Message,
    Activity,
    SecurityLog
  };
};

// Call the association setup
const models = setupAssociations();

const db = {
  sequelize,
  Sequelize,
  ...models
};

module.exports = db;
