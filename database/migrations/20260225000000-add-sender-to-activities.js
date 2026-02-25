'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('activities', 'sender', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE activities
      SET sender = metadata->>'sender'
      WHERE sender IS NULL
        AND metadata ? 'sender'
        AND jsonb_typeof(metadata->'sender') = 'string'
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('activities', 'sender');
  }
};
