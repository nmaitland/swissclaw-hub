'use strict';

const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const passwordHash = await bcrypt.hash('testpassword123', 10);
    const adminPasswordHash = await bcrypt.hash('adminpassword123', 10);

    await queryInterface.bulkInsert('users', [
      {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        email: 'test@example.com',
        name: 'Test User',
        password_hash: passwordHash,
        role: 'user',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        email: 'neil@example.com',
        name: 'Neil',
        password_hash: adminPasswordHash,
        role: 'admin',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
        email: 'swissclaw@example.com',
        name: 'SwissClaw',
        password_hash: passwordHash,
        role: 'user',
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', null, {});
  }
};
