'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if task_id column exists
    const tableInfo = await queryInterface.describeTable('kanban_tasks');

    if (!tableInfo.task_id) {
      console.log('Adding task_id column to kanban_tasks table...');
      await queryInterface.addColumn('kanban_tasks', 'task_id', {
        type: Sequelize.STRING(20),
        unique: true,
        allowNull: true
      });

      // Update existing rows with generated task_ids
      const tasks = await queryInterface.sequelize.query(
        'SELECT id FROM kanban_tasks WHERE task_id IS NULL',
        { type: Sequelize.QueryTypes.SELECT }
      );

      for (const task of tasks) {
        const taskId = `TASK-${String(task.id).padStart(3, '0')}`;
        await queryInterface.sequelize.query(
          'UPDATE kanban_tasks SET task_id = ? WHERE id = ?',
          { replacements: [taskId, task.id] }
        );
      }

      console.log(`Added task_id column and updated ${tasks.length} existing tasks`);
    } else {
      console.log('task_id column already exists, skipping...');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('kanban_tasks', 'task_id');
  }
};
