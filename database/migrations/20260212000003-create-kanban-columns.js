'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('kanban_columns', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      display_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      emoji: {
        type: Sequelize.STRING(10),
        defaultValue: ''
      },
      color: {
        type: Sequelize.STRING(20),
        defaultValue: ''
      },
      position: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('kanban_columns');
  }
};
