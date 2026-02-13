const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { Pool } = require('pg');

/**
 * Integration tests for Kanban task ordering with sparse positioning
 */

describe('Kanban Task Ordering', () => {
  let pool;
  let authToken;
  let testColumnId;

  beforeAll(async () => {
    await resetTestDb();
    
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || 'postgresql://postgres:password@localhost:5433/swissclaw_hub_test'
    });

    // Create a test column
    const columnResult = await pool.query(
      "INSERT INTO kanban_columns (name, display_name, emoji, color, position) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      ['test-ordering', 'Test Ordering', '📝', '#ff0000', 99]
    );
    testColumnId = columnResult.rows[0].id;

    // Login to get auth token
    const loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'changeme123' });
    authToken = loginRes.body.token;
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clear tasks before each test
    await pool.query('DELETE FROM kanban_tasks WHERE column_id = $1', [testColumnId]);
  });

  describe('Task Creation with Position', () => {
    test('should create task with position field', async () => {
      const res = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'test-ordering',
          title: 'Test Task',
          description: 'A test task',
          priority: 'medium'
        });
      
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('position');
      expect(typeof res.body.position).toBe('number');
    });

    test('should assign increasing positions to new tasks', async () => {
      // Create first task
      const res1 = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'test-ordering',
          title: 'Task 1',
          priority: 'medium'
        });
      
      const pos1 = res1.body.position;

      // Create second task
      const res2 = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'test-ordering',
          title: 'Task 2',
          priority: 'medium'
        });
      
      const pos2 = res2.body.position;

      // Second task should have higher position than first
      expect(pos2).toBeGreaterThan(pos1);
    });
  });

  describe('Task Update with Position', () => {
    test('should update task with explicit position', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'test-ordering',
          title: 'Task to Update',
          priority: 'medium'
        });
      
      const taskId = createRes.body.id;

      // Update with explicit position
      const updateRes = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          position: 999999
        });
      
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.position).toBe(999999);
    });

    test('should update task with targetTaskId for relative positioning', async () => {
      // Create two tasks
      const res1 = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'test-ordering',
          title: 'Task A',
          priority: 'medium'
        });
      
      const res2 = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'test-ordering',
          title: 'Task B',
          priority: 'medium'
        });
      
      const taskAId = res1.body.id;
      const taskBId = res2.body.id;

      // Move Task A to be positioned relative to Task B
      const updateRes = await request(app)
        .put(`/api/kanban/tasks/${taskAId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetTaskId: taskBId,
          insertAfter: false
        });
      
      expect(updateRes.status).toBe(200);
      // Position should be recalculated
      expect(updateRes.body).toHaveProperty('position');
    });
  });

  describe('Batch Reorder Endpoint', () => {
    test('should batch reorder tasks', async () => {
      // Create three tasks
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/kanban/tasks')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            columnName: 'test-ordering',
            title: `Task ${i}`,
            priority: 'medium'
          });
        tasks.push({ id: res.body.id, position: res.body.position });
      }

      // Batch reorder - reverse the order
      const reorderRes = await request(app)
        .post('/api/kanban/reorder')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnId: testColumnId,
          taskPositions: [
            { taskId: tasks[0].id, position: tasks[2].position },
            { taskId: tasks[1].id, position: tasks[1].position },
            { taskId: tasks[2].id, position: tasks[0].position }
          ]
        });
      
      expect(reorderRes.status).toBe(200);
      expect(reorderRes.body.success).toBe(true);
    });

    test('should return 400 for invalid reorder request', async () => {
      const res = await request(app)
        .post('/api/kanban/reorder')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          taskPositions: []
        });
      
      expect(res.status).toBe(400);
    });
  });

  describe('Position in API Responses', () => {
    test('should include position in kanban list response', async () => {
      // Create a task
      await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'test-ordering',
          title: 'List Test Task',
          priority: 'medium'
        });

      // Get kanban data
      const listRes = await request(app)
        .get('/api/kanban')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(listRes.status).toBe(200);
      expect(listRes.body.tasks).toBeDefined();
      
      // Check that tasks have position field
      const columnTasks = listRes.body.tasks['test-ordering'];
      if (columnTasks && columnTasks.length > 0) {
        expect(columnTasks[0]).toHaveProperty('position');
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle moving task to different column', async () => {
      // Create task in test column
      const createRes = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'test-ordering',
          title: 'Move Test Task',
          priority: 'medium'
        });
      
      const taskId = createRes.body.id;

      // Move to todo column
      const moveRes = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo'
        });
      
      expect(moveRes.status).toBe(200);
      expect(moveRes.body).toHaveProperty('position');
    });

    test('should handle updating task without changing position', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'test-ordering',
          title: 'Update Test Task',
          priority: 'medium'
        });
      
      const taskId = createRes.body.id;
      const originalPosition = createRes.body.position;

      // Update only title
      const updateRes = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Title'
        });
      
      expect(updateRes.status).toBe(200);
      // Position should remain unchanged
      expect(updateRes.body.position).toBe(originalPosition);
    });
  });
});