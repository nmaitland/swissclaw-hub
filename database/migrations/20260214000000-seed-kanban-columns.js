'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if columns already exist
    const existingColumns = await queryInterface.sequelize.query(
      `SELECT name FROM kanban_columns WHERE name IN ('backlog', 'todo', 'inProgress', 'review', 'done', 'waiting-for-neil')`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const existingNames = existingColumns.map(col => col.name);

    const columnsToInsert = [
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
    ].filter(col => !existingNames.includes(col.name));

    if (columnsToInsert.length > 0) {
      await queryInterface.bulkInsert('kanban_columns', columnsToInsert, {});
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the seeded columns
    await queryInterface.bulkDelete('kanban_columns', {
      name: ['backlog', 'todo', 'inProgress', 'review', 'done', 'waiting-for-neil']
    }, {});
  }
};
