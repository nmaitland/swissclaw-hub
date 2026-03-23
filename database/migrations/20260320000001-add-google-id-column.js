'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'google_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      defaultValue: null,
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'google_id');
  }
};
