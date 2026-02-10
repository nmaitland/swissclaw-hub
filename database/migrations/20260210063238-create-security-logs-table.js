'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('security_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false
      },
      method: {
        type: Sequelize.STRING,
        allowNull: true
      },
      path: {
        type: Sequelize.STRING,
        allowNull: true
      },
      status_code: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      duration: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes
    await queryInterface.addIndex('security_logs', ['type']);
    await queryInterface.addIndex('security_logs', ['created_at']);
    await queryInterface.addIndex('security_logs', ['user_id']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('security_logs');
  }
};
