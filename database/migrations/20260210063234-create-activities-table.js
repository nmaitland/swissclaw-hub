'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('activities', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      action: {
        type: Sequelize.STRING,
        allowNull: false
      },
      entity_type: {
        type: Sequelize.STRING,
        allowNull: true
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      details: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes
    await queryInterface.addIndex('activities', ['user_id']);
    await queryInterface.addIndex('activities', ['entity_type']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('activities');
  }
};
