'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if tasks already exist
    const existingTasks = await queryInterface.sequelize.query(
      `SELECT task_id FROM kanban_tasks WHERE task_id IN ('TASK-001', 'TASK-002', 'TASK-003', 'TASK-004', 'TASK-005', 'TASK-006')`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (existingTasks.length > 0) {
      // Tasks already seeded, skip
      return;
    }

    // Get column IDs
    const columns = await queryInterface.sequelize.query(
      'SELECT id, name FROM kanban_columns',
      { type: Sequelize.QueryTypes.SELECT }
    );

    const columnMap = {};
    columns.forEach(col => {
      columnMap[col.name] = col.id;
    });

    const tasks = [
      {
        task_id: 'TASK-001',
        column_id: columnMap['backlog'],
        title: 'Set up project infrastructure',
        description: 'Initialize repository, configure CI/CD, and set up development environment',
        priority: 'high',
        assigned_to: 'swissclaw',
        tags: JSON.stringify(['infrastructure', 'setup']),
        attachment_count: 0,
        comment_count: 0,
        position: 0,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        task_id: 'TASK-002',
        column_id: columnMap['todo'],
        title: 'Design database schema',
        description: 'Create ERD and define table structures for all entities',
        priority: 'high',
        assigned_to: 'neil',
        tags: JSON.stringify(['database', 'design']),
        attachment_count: 1,
        comment_count: 2,
        position: 0,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        task_id: 'TASK-003',
        column_id: columnMap['inProgress'],
        title: 'Implement authentication',
        description: 'Add session-based auth with bcrypt and secure cookies',
        priority: 'high',
        assigned_to: 'swissclaw',
        tags: JSON.stringify(['auth', 'security']),
        attachment_count: 0,
        comment_count: 1,
        position: 0,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        task_id: 'TASK-004',
        column_id: columnMap['review'],
        title: 'Create kanban board UI',
        description: 'Build drag-and-drop kanban interface with @dnd-kit',
        priority: 'medium',
        assigned_to: 'neil',
        tags: JSON.stringify(['frontend', 'ui']),
        attachment_count: 2,
        comment_count: 3,
        position: 0,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        task_id: 'TASK-005',
        column_id: columnMap['done'],
        title: 'Set up logging',
        description: 'Integrate pino for structured logging throughout the app',
        priority: 'medium',
        assigned_to: 'swissclaw',
        tags: JSON.stringify(['logging', 'devops']),
        attachment_count: 0,
        comment_count: 0,
        position: 0,
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        task_id: 'TASK-006',
        column_id: columnMap['waiting-for-neil'],
        title: 'Review API documentation',
        description: 'Neil to review Swagger docs and provide feedback',
        priority: 'low',
        assigned_to: 'neil',
        tags: JSON.stringify(['docs', 'review']),
        attachment_count: 1,
        comment_count: 0,
        position: 0,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await queryInterface.bulkInsert('kanban_tasks', tasks, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('kanban_tasks', {
      task_id: ['TASK-001', 'TASK-002', 'TASK-003', 'TASK-004', 'TASK-005', 'TASK-006']
    }, {});
  }
};
