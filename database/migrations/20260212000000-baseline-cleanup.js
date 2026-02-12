'use strict';

/**
 * Baseline migration: Clean up old tables before creating new schema
 * This handles the transition from initDb()-created tables to Sequelize-managed tables
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop old tables if they exist (from initDb())
    // Using CASCADE to handle foreign key constraints
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS kanban_tasks CASCADE');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS kanban_columns CASCADE');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS messages CASCADE');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS activities CASCADE');
    
    // Also drop any tables from the old server/config/database.ts schema
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS sessions CASCADE');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS users CASCADE');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS security_logs CASCADE');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS status CASCADE');
    
    // Clear SequelizeMeta if it exists (to ensure clean slate)
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS "SequelizeMeta" CASCADE');
  },

  async down(queryInterface, Sequelize) {
    // Cannot restore dropped tables
    console.log('Baseline cleanup cannot be undone - tables were dropped');
  }
};