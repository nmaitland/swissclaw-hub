'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkInsert('kanban_tasks', [
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        title: 'Test Task 1',
        description: 'Description for test task 1',
        status: 'todo',
        priority: 'high',
        assigned_to: 'swissclaw',
        column: 'todo',
        created_by: '550e8400-e29b-41d4-a716-446655440002',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440011',
        title: 'Test Task 2',
        description: 'Description for test task 2',
        status: 'inprogress',
        priority: 'medium',
        assigned_to: 'neil',
        column: 'inprogress',
        created_by: '550e8400-e29b-41d4-a716-446655440001',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440012',
        title: 'Test Task 3',
        description: 'Description for test task 3',
        status: 'done',
        priority: 'low',
        assigned_to: 'swissclaw',
        column: 'done',
        created_by: '550e8400-e29b-41d4-a716-446655440002',
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('kanban_tasks', {
      id: ['550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440012']
    }, {});
  }
};
