'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('messages', 'processing_state', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('messages', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addIndex('messages', ['processing_state'], {
      name: 'idx_messages_processing_state'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('messages', 'idx_messages_processing_state');
    await queryInterface.removeColumn('messages', 'updated_at');
    await queryInterface.removeColumn('messages', 'processing_state');
  }
};
