const request = require('supertest');
const { app, resetTestDb, pool } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

/**
 * Integration tests for Kanban task ordering with sparse positioning
 */

describe('Kanban Task Ordering', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  describe('Task Creation with Position', () => {
    it('should create task with position field', async () => {
      const res = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Test Task with Position',
          description: 'A test task',
          priority: 'medium'
        })
        .expect(201);
      
      expect(res.body).toHaveProperty('position');
      expect(res.body.position).toBeDefined();
      expect(res.body.position).not.toBeNull();
    });

    it('should assign increasing positions to new tasks', async () => {
      // Create first task
      const res1 = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Task 1 for Position Test',
          priority: 'medium'
        })
        .expect(201);
      
      const pos1 = BigInt(res1.body.position);

      // Create second task
      const res2 = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Task 2 for Position Test',
          priority: 'medium'
        })
        .expect(201);
      
      const pos2 = BigInt(res2.body.position);

      // Second task should have higher position than first
      expect(pos2 > pos1).toBe(true);
    });
  });

  describe('Task Update with Position', () => {
    it('should update task with explicit position', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Task to Update Position',
          priority: 'medium'
        })
        .expect(201);
      
      const taskId = createRes.body.id;

      // Update with explicit position
      const updateRes = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          position: 999999
        })
        .expect(200);
      
      expect(updateRes.body.position).toBeDefined();
      expect(Number(updateRes.body.position)).toBe(999999);
    });

    it('should update task with targetTaskId for relative positioning', async () => {
      // Create two tasks
      const res1 = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Task A for Relative Position',
          priority: 'medium'
        })
        .expect(201);
      
      const res2 = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Task B for Relative Position',
          priority: 'medium'
        })
        .expect(201);
      
      const taskAId = res1.body.id;
      const taskBId = res2.body.id;

      // Move Task A to be positioned relative to Task B
      const updateRes = await request(app)
        .put(`/api/kanban/tasks/${taskAId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetTaskId: taskBId,
          insertAfter: false
        })
        .expect(200);
      
      expect(updateRes.body).toHaveProperty('position');
    });
  });

  describe('Batch Reorder Endpoint', () => {
    it('should batch reorder tasks', async () => {
      // Create three tasks
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/kanban/tasks')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            columnName: 'todo',
            title: `Batch Task ${i}`,
            priority: 'medium'
          })
          .expect(201);
        tasks.push({ id: res.body.id, position: res.body.position });
      }

      // Get todo column ID from database
      const columnResult = await pool.query("SELECT id FROM kanban_columns WHERE name = 'todo'");
      const todoColumnId = columnResult.rows[0].id;

      // Batch reorder - reverse the order
      const reorderRes = await request(app)
        .post('/api/kanban/reorder')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnId: todoColumnId,
          taskPositions: [
            { taskId: tasks[0].id, position: tasks[2].position },
            { taskId: tasks[1].id, position: tasks[1].position },
            { taskId: tasks[2].id, position: tasks[0].position }
          ]
        })
        .expect(200);
      
      expect(reorderRes.body.success).toBe(true);
    });

    it('should return 400 for invalid reorder request', async () => {
      await request(app)
        .post('/api/kanban/reorder')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          taskPositions: []
        })
        .expect(400);
    });
  });

  describe('Position in API Responses', () => {
    it('should include position in kanban list response', async () => {
      // Create a task
      await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'List Test Task with Position',
          priority: 'medium'
        })
        .expect(201);

      // Get kanban data
      const listRes = await request(app)
        .get('/api/kanban')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(listRes.body.tasks).toBeDefined();
      
      // Check that tasks have position field
      const columnTasks = listRes.body.tasks['todo'];
      if (columnTasks && columnTasks.length > 0) {
        expect(columnTasks[0]).toHaveProperty('position');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle moving task to different column', async () => {
      // Create task in todo column
      const createRes = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Move Test Task to InProgress',
          priority: 'medium'
        })
        .expect(201);
      
      const taskId = createRes.body.id;

      // Move to inProgress column
      const moveRes = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'inProgress'
        })
        .expect(200);
      
      expect(moveRes.body).toHaveProperty('position');
    });

    it('should handle updating task without changing position', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Update Without Position Change',
          priority: 'medium'
        })
        .expect(201);
      
      const taskId = createRes.body.id;
      const originalPosition = createRes.body.position;

      // Update only title
      const updateRes = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Title Only'
        })
        .expect(200);
      
      // Position should remain unchanged
      expect(updateRes.body.position).toBe(originalPosition);
    });
  });
});