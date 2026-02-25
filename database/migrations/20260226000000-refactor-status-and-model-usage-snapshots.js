'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Existing values are intentionally discarded before format changes.
    await queryInterface.sequelize.query('TRUNCATE TABLE status RESTART IDENTITY CASCADE');
    await queryInterface.sequelize.query('TRUNCATE TABLE model_usage RESTART IDENTITY CASCADE');

    await queryInterface.dropTable('status');
    await queryInterface.createTable('status', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        defaultValue: 1,
      },
      state: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      current_task: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      last_active: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.sequelize.query(
      "ALTER TABLE status ADD CONSTRAINT status_singleton_id CHECK (id = 1)"
    );
    await queryInterface.sequelize.query(
      "INSERT INTO status (id, state, current_task, last_active, updated_at) VALUES (1, 'idle', 'Ready to help', NOW(), NOW())"
    );

    await queryInterface.dropTable('model_usage');
    await queryInterface.createTable('model_usage', {
      usage_date: {
        type: Sequelize.DATEONLY,
        primaryKey: true,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      models_json: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('model_usage', ['updated_at'], {
      name: 'idx_model_usage_updated_at',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('status');
    await queryInterface.createTable('status', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      current_task: {
        type: Sequelize.TEXT
      },
      last_updated: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false
      }
    });

    await queryInterface.dropTable('model_usage');
    await queryInterface.createTable('model_usage', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      input_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      output_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      model: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      estimated_cost: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false
      }
    });

    await queryInterface.addIndex('model_usage', ['created_at'], {
      name: 'idx_model_usage_created_at'
    });
  }
};
