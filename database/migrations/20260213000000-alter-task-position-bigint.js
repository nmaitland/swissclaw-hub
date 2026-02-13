'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Change position column from INTEGER to BIGINT
    await queryInterface.changeColumn('kanban_tasks', 'position', {
      type: Sequelize.BIGINT,
      defaultValue: 0
    });

    // 2. Seed existing tasks with sparse positions (gap = 1,000,000)
    const GAP = 1000000n; // Use BigInt for large numbers
    
    // Get all columns
    const columns = await queryInterface.sequelize.query(
      'SELECT id FROM kanban_columns ORDER BY position',
      { type: Sequelize.QueryTypes.SELECT }
    );

    for (const column of columns) {
      // Get tasks for this column ordered by current position
      const tasks = await queryInterface.sequelize.query(
        `SELECT id FROM kanban_tasks WHERE column_id = :columnId ORDER BY position, id`,
        {
          replacements: { columnId: column.id },
          type: Sequelize.QueryTypes.SELECT
        }
      );

      // Update each task with sparse position
      for (let i = 0; i < tasks.length; i++) {
        const newPosition = BigInt(i) * GAP;
        await queryInterface.sequelize.query(
          `UPDATE kanban_tasks SET position = :position WHERE id = :taskId`,
          {
            replacements: { 
              position: newPosition.toString(), // Convert BigInt to string for PostgreSQL
              taskId: tasks[i].id 
            }
          }
        );
      }
    }

    // 3. Create a function for rebalancing positions
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION rebalance_column_positions(p_column_id INTEGER)
      RETURNS VOID AS $$
      DECLARE
        gap CONSTANT BIGINT := 1000000;
        task_record RECORD;
        i BIGINT := 0;
      BEGIN
        FOR task_record IN 
          SELECT id FROM kanban_tasks 
          WHERE column_id = p_column_id 
          ORDER BY position, id
        LOOP
          UPDATE kanban_tasks 
          SET position = i * gap 
          WHERE id = task_record.id;
          i := i + 1;
        END LOOP;
      END;
      $$ LANGUAGE plpgsql;
    `);
  },

  async down(queryInterface, Sequelize) {
    // 1. Drop the rebalancing function
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS rebalance_column_positions(INTEGER)');

    // 2. Change position column back to INTEGER (note: may lose data if positions > 2^31-1)
    await queryInterface.changeColumn('kanban_tasks', 'position', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
  }
};