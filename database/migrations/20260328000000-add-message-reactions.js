'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('message_reactions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      message_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'messages',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      reactor: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      emoji: {
        type: Sequelize.STRING(10),
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        allowNull: false
      }
    });

    await queryInterface.addIndex('message_reactions', ['message_id'], {
      name: 'idx_message_reactions_message_id'
    });

    // Unique constraint: one reaction per user per message
    await queryInterface.addIndex('message_reactions', ['message_id', 'reactor', 'emoji'], {
      name: 'idx_message_reactions_unique',
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('message_reactions');
  }
};