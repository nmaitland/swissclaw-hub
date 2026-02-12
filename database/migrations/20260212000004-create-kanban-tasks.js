'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('kanban_tasks', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      task_id: {
        type: Sequelize.STRING(20),
        unique: true
      },
      column_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'kanban_columns',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      priority: {
        type: Sequelize.STRING(20),
        defaultValue: 'medium'
      },
      assigned_to: {
        type: Sequelize.STRING(50)
      },
      tags: {
        type: Sequelize.JSONB,
        defaultValue: []
      },
      attachment_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      comment_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      position: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false
      }
    });

    await queryInterface.addIndex('kanban_tasks', ['column_id'], {
      name: 'idx_kanban_tasks_column_id'
    });

    await queryInterface.addIndex('kanban_tasks', ['position'], {
      name: 'idx_kanban_tasks_position'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('kanban_tasks');
  }
};
