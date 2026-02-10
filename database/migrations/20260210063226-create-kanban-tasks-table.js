'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('kanban_tasks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('todo', 'inprogress', 'done'),
        defaultValue: 'todo'
      },
      priority: {
        type: Sequelize.ENUM('low', 'medium', 'high'),
        defaultValue: 'medium'
      },
      assigned_to: {
        type: Sequelize.STRING,
        allowNull: true
      },
      column: {
        type: Sequelize.STRING,
        defaultValue: 'backlog'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes
    await queryInterface.addIndex('kanban_tasks', ['status']);
    await queryInterface.addIndex('kanban_tasks', ['assigned_to']);
    await queryInterface.addIndex('kanban_tasks', ['created_by']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('kanban_tasks');
  }
};
