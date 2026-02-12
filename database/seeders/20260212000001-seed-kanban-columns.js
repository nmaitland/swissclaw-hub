'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('kanban_columns', [
      {
        name: 'backlog',
        display_name: 'Backlog',
        emoji: '📝',
        color: '#6b7280',
        position: 0,
        created_at: new Date()
      },
      {
        name: 'todo',
        display_name: 'To Do',
        emoji: '📋',
        color: '#3b82f6',
        position: 1,
        created_at: new Date()
      },
      {
        name: 'inProgress',
        display_name: 'In Progress',
        emoji: '🚀',
        color: '#f59e0b',
        position: 2,
        created_at: new Date()
      },
      {
        name: 'review',
        display_name: 'Review',
        emoji: '👀',
        color: '#8b5cf6',
        position: 3,
        created_at: new Date()
      },
      {
        name: 'done',
        display_name: 'Done',
        emoji: '✅',
        color: '#10b981',
        position: 4,
        created_at: new Date()
      },
      {
        name: 'waiting-for-neil',
        display_name: 'Waiting for Neil',
        emoji: '⏸️',
        color: '#ef4444',
        position: 5,
        created_at: new Date()
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('kanban_columns', null, {});
  }
};
