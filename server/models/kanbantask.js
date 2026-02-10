const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  if (!sequelize) {
    return { KanbanTask: null };
  }

  class KanbanTask extends Model {
    static associate(models) {
      // associations can be defined here
      KanbanTask.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    }
  }

  KanbanTask.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('todo', 'inprogress', 'done'),
      defaultValue: 'todo'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high'),
      defaultValue: 'medium'
    },
    assigned_to: {
      type: DataTypes.STRING,
      allowNull: true
    },
    column: {
      type: DataTypes.STRING,
      defaultValue: 'backlog'
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
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
    modelName: 'KanbanTask',
    tableName: 'kanban_tasks',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return { KanbanTask };
};
