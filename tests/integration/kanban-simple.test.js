const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');
const { getAuthToken } = require('../helpers/auth');

/**
 * These tests exercise the real Kanban HTTP API implemented in
 * `server/index.js`, not a mocked Express app.
 *
 * The production API exposes:
 *   - GET    /api/kanban
 *   - POST   /api/kanban/tasks
 *   - PUT    /api/kanban/tasks/:id
 *   - DELETE /api/kanban/tasks/:id
 *
 * We treat the database as a black box and focus on HTTP contract
 * and response shape.
 */

describe('Kanban API (real server)', () => {
  let authToken;

  beforeAll(async () => {
    await resetTestDb();
    authToken = await getAuthToken();
  });

  describe('GET /api/kanban', () => {
    it('returns columns and tasks in the new kanban format', async () => {
      const response = await request(app)
        .get('/api/kanban')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('columns');
      expect(response.body).toHaveProperty('tasks');

      const { columns, tasks } = response.body;

      expect(Array.isArray(columns)).toBe(true);
      expect(typeof tasks).toBe('object');

      // Each column should have a matching key in tasks
      columns.forEach((col) => {
        expect(col).toHaveProperty('name');
        expect(tasks).toHaveProperty(col.name);
        expect(Array.isArray(tasks[col.name])).toBe(true);
      });
    });
  });

  describe('POST /api/kanban/tasks', () => {
    it('creates a new kanban task in the specified column', async () => {
      const newTask = {
        columnName: 'todo',
        title: 'Integration Test Task',
        description: 'Created from kanban-simple.test.js',
        priority: 'high',
        assignedTo: 'swissclaw',
        tags: ['test', 'integration'],
      };

      const response = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newTask)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('taskId');
      expect(response.body.title).toBe(newTask.title);
      expect(response.body.description).toBe(newTask.description);
      expect(response.body.priority).toBe(newTask.priority);
      expect(response.body.assignedTo).toBe(newTask.assignedTo);
      expect(Array.isArray(response.body.tags)).toBe(true);
    });

    it('returns 400 when required fields are missing', async () => {
      const invalidTask = {
        // Missing columnName and title
        description: 'Task without required fields',
      };

      const response = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTask)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/kanban/tasks/:id', () => {
    it('updates an existing kanban task', async () => {
      // First create a task via the API
      const createResponse = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Task to update',
          description: 'Original description',
          priority: 'medium',
          assignedTo: 'neil',
        })
        .expect(201);

      const taskId = createResponse.body.id;

      const updateData = {
        columnName: 'done',
        title: 'Updated Task Title',
        priority: 'high',
      };

      const updateResponse = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.id).toBe(taskId);
      expect(updateResponse.body.title).toBe(updateData.title);
      expect(updateResponse.body.priority).toBe(updateData.priority);
    });

    it('returns 404 when updating non-existent task', async () => {
      const fakeId = 999999; // unlikely to exist

      const response = await request(app)
        .put(`/api/kanban/tasks/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Title' })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Task not found');
    });
  });

  describe('DELETE /api/kanban/tasks/:id', () => {
    it('deletes an existing kanban task', async () => {
      // Create a task to delete
      const createResponse = await request(app)
        .post('/api/kanban/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          columnName: 'todo',
          title: 'Task to delete',
          description: 'This task will be deleted',
        })
        .expect(201);

      const taskId = createResponse.body.id;

      await request(app)
        .delete(`/api/kanban/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('returns 404 when deleting non-existent task', async () => {
      const fakeId = 999999; // unlikely to exist

      const response = await request(app)
        .delete(`/api/kanban/tasks/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Task not found');
    });
  });
});
