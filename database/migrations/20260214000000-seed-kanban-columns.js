'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if columns already exist
    const existingColumns = await queryInterface.sequelize.query(
      `SELECT name FROM kanban_columns WHERE name IN ('backlog', 'todo', 'inProgress', 'review', 'done', 'waiting')`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const existingNames = existingColumns.map(col => col.name);

    const columnsToInsert = [
      {
        name: 'backlog',
        display_name: 'Backlog',
        emoji: 'Ã°Å¸â€œÂ',
        color: '#6b7280',
        position: 0,
        created_at: new Date()
      },
      {
        name: 'todo',
        display_name: 'To Do',
        emoji: 'Ã°Å¸â€œâ€¹',
        color: '#3b82f6',
        position: 1,
        created_at: new Date()
      },
      {
        name: 'inProgress',
        display_name: 'In Progress',
        emoji: 'Ã°Å¸Å¡â‚¬',
        color: '#f59e0b',
        position: 2,
        created_at: new Date()
      },
      {
        name: 'review',
        display_name: 'Review',
        emoji: 'Ã°Å¸â€˜â‚¬',
        color: '#8b5cf6',
        position: 3,
        created_at: new Date()
      },
      {
        name: 'done',
        display_name: 'Done',
        emoji: 'Ã¢Å“â€¦',
        color: '#10b981',
        position: 4,
        created_at: new Date()
      },
      {
        name: 'waiting',
        display_name: 'Waiting',
        emoji: 'Ã¢ÂÂ¸Ã¯Â¸Â',
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
      name: ['backlog', 'todo', 'inProgress', 'review', 'done', 'waiting']
    }, {});
  }
};
