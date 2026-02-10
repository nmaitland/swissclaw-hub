'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkInsert('messages', [
      {
        id: '550e8400-e29b-41d4-a716-446655440020',
        sender_id: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Test message 1',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440021',
        sender_id: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Test message 2',
        created_at: new Date(Date.now() - 3600000), // 1 hour ago
        updated_at: new Date(Date.now() - 3600000)
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440022',
        sender_id: '550e8400-e29b-41d4-a716-446655440001',
        content: 'Hello from Neil!',
        created_at: new Date(Date.now() - 7200000), // 2 hours ago
        updated_at: new Date(Date.now() - 7200000)
      }
    ], {});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('messages', {
      id: ['550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440022']
    }, {});
  }
};
