'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('activities', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false
      }
    });

    await queryInterface.addIndex('activities', ['created_at'], {
      name: 'idx_activities_created_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('activities');
  }
};
