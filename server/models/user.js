const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  if (!sequelize) {
    return { User: null };
  }

  class User extends Model {
    static associate(models) {
      // associations can be defined here
      if (models.KanbanTask) User.hasMany(models.KanbanTask, { foreignKey: 'created_by', as: 'createdTasks' });
      if (models.Message) User.hasMany(models.Message, { foreignKey: 'sender_id', as: 'messages' });
      if (models.Activity) User.hasMany(models.Activity, { foreignKey: 'user_id', as: 'activities' });
      if (models.SecurityLog) User.hasMany(models.SecurityLog, { foreignKey: 'user_id', as: 'securityLogs' });
    }
  }

  User.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('user', 'admin'),
      defaultValue: 'user'
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return { User };
};
