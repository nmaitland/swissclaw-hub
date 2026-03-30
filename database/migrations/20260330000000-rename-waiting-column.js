'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `
      UPDATE kanban_columns
      SET name = 'waiting',
          display_name = 'Waiting'
      WHERE name = 'waiting-for-neil'
      `,
      { type: Sequelize.QueryTypes.UPDATE }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `
      UPDATE kanban_columns
      SET name = 'waiting-for-neil',
          display_name = 'Waiting for Neil'
      WHERE name = 'waiting'
      `,
      { type: Sequelize.QueryTypes.UPDATE }
    );
  }
};
