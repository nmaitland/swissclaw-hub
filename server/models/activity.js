const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  if (!sequelize) {
    return { Activity: null };
  }

  class Activity extends Model {
    static associate(models) {
      // associations can be defined here
      Activity.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }

  Activity.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false
    },
    entity_type: {
      type: DataTypes.STRING,
      allowNull: true
    },
    entity_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'Activity',
    tableName: 'activities',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  return { Activity };
};
