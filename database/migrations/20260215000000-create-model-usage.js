'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('model_usage');
  }
};
