const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');

describe('Kanban API edge cases', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  describe('POST /api/kanban/tasks', () => {
    it('returns 404 when column does not exist', async () => {
      const response = await request(app)
        .post('/api/kanban/tasks')
        .send({
          columnName: 'nonexistent-column',
          title: 'Task in bad column',
        })
        .expect(404);

      expect(response.body.error).toBe('Column not found');
    });

    it('returns 400 when title is missing', async () => {
      const response = await request(app)
        .post('/api/kanban/tasks')
        .send({ columnName: 'todo' })
        .expect(400);

      expect(response.body.error).toMatch(/required/i);
    });

    it('returns 400 when columnName is missing', async () => {
      const response = await request(app)
        .post('/api/kanban/tasks')
        .send({ title: 'Title without column' })
        .expect(400);

      expect(response.body.error).toMatch(/required/i);
    });

    it('creates task with default priority when not specified', async () => {
      const response = await request(app)
        .post('/api/kanban/tasks')
        .send({
          columnName: 'backlog',
          title: 'Default priority task',
        })
        .expect(201);

      expect(response.body.priority).toBe('medium');
    });

    it('creates task with empty tags when not specified', async () => {
      const response = await request(app)
        .post('/api/kanban/tasks')
        .send({
          columnName: 'backlog',
          title: 'No tags task',
        })
        .expect(201);

      expect(Array.isArray(response.body.tags)).toBe(true);
    });

    it('generates unique task IDs', async () => {
      const task1 = await request(app)
        .post('/api/kanban/tasks')
        .send({ columnName: 'backlog', title: 'Task A' })
        .expect(201);

      const task2 = await request(app)
        .post('/api/kanban/tasks')
        .send({ columnName: 'backlog', title: 'Task B' })
        .expect(201);

      expect(task1.body.taskId).toBeDefined();
      expect(task2.body.taskId).toBeDefined();
      expect(task1.body.taskId).not.toBe(task2.body.taskId);
    });
  });

  describe('PUT /api/kanban/tasks/:id', () => {
    let taskId;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/kanban/tasks')
        .send({
          columnName: 'todo',
          title: 'Editable task',
          description: 'Original description',
          priority: 'low',
          assignedTo: 'neil',
          tags: ['original'],
        })
        .expect(201);

      taskId = response.body.id;
    });

    it('updates only the title when only title is sent', async () => {
      const response = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .send({ title: 'New title only' })
        .expect(200);

      expect(response.body.title).toBe('New title only');
      // Other fields should remain
      expect(response.body.priority).toBe('low');
    });

    it('updates description to null when empty string sent', async () => {
      const response = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .send({ description: '' })
        .expect(200);

      expect(response.body.description).toBeNull();
    });

    it('updates tags', async () => {
      const response = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .send({ tags: ['updated', 'new-tag'] })
        .expect(200);

      expect(response.body.tags).toEqual(expect.arrayContaining(['updated', 'new-tag']));
    });

    it('updates assignedTo', async () => {
      const response = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .send({ assignedTo: 'swissclaw' })
        .expect(200);

      expect(response.body.assignedTo).toBe('swissclaw');
    });

    it('sets updatedAt on update', async () => {
      const before = new Date();
      const response = await request(app)
        .put(`/api/kanban/tasks/${taskId}`)
        .send({ priority: 'high' })
        .expect(200);

      const updatedAt = new Date(response.body.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000);
    });
  });

  describe('DELETE /api/kanban/tasks/:id', () => {
    it('returns the deleted task data', async () => {
      const created = await request(app)
        .post('/api/kanban/tasks')
        .send({ columnName: 'backlog', title: 'To be deleted' })
        .expect(201);

      const response = await request(app)
        .delete(`/api/kanban/tasks/${created.body.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deleted).toBeDefined();
    });

    it('task no longer appears in listing after deletion', async () => {
      const created = await request(app)
        .post('/api/kanban/tasks')
        .send({ columnName: 'backlog', title: 'Delete-verify task' })
        .expect(201);

      await request(app)
        .delete(`/api/kanban/tasks/${created.body.id}`)
        .expect(200);

      const listing = await request(app)
        .get('/api/kanban')
        .expect(200);

      const allTasks = Object.values(listing.body.tasks).flat();
      const found = allTasks.find(t => t.id === created.body.id);
      expect(found).toBeUndefined();
    });
  });
});
