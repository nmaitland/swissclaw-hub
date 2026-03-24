'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('messages', 'conversation_id', {
      type: Sequelize.STRING(200),
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addIndex('messages', ['conversation_id', 'created_at'], {
      name: 'idx_messages_conversation_created'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('messages', 'idx_messages_conversation_created');
    await queryInterface.removeColumn('messages', 'conversation_id');
  }
};
