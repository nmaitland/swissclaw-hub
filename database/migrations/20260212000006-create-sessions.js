'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sessions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      token: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      user_agent: {
        type: Sequelize.TEXT
      },
      ip_address: {
        type: Sequelize.INET
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false
      },
      last_accessed_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      revoked_at: {
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('sessions', ['token'], {
      name: 'idx_sessions_token'
    });

    await queryInterface.addIndex('sessions', ['user_id'], {
      name: 'idx_sessions_user_id'
    });

    await queryInterface.addIndex('sessions', ['expires_at'], {
      name: 'idx_sessions_expires_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sessions');
  }
};
