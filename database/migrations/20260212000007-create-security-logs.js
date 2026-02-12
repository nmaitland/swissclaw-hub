'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('security_logs', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        allowNull: false
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      method: {
        type: Sequelize.STRING(10)
      },
      path: {
        type: Sequelize.STRING(255)
      },
      status_code: {
        type: Sequelize.INTEGER
      },
      ip_address: {
        type: Sequelize.INET
      },
      user_agent: {
        type: Sequelize.TEXT
      },
      user_id: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      duration: {
        type: Sequelize.INTEGER
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

    await queryInterface.addIndex('security_logs', ['created_at'], {
      name: 'idx_security_logs_created_at'
    });

    await queryInterface.addIndex('security_logs', ['type'], {
      name: 'idx_security_logs_type'
    });

    await queryInterface.addIndex('security_logs', ['user_id'], {
      name: 'idx_security_logs_user_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('security_logs');
  }
};
