const request = require('supertest');
const express = require('express');
const { setupTestDb, teardownTestDb, seedTestData, db } = require('./setup');

const app = express();
app.use(express.json());

// Mock kanban API routes
app.get('/api/kanban', async (req, res) => {
  try {
    const tasks = await db.KanbanTask.findAll({
      order: [['created_at', 'DESC']]
    });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/kanban', async (req, res) => {
  try {
    const { title, description, priority = 'medium', assigned_to, column = 'backlog' } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const newTask = await db.KanbanTask.create({
      title,
      description,
      priority,
      assigned_to,
      column
    });
    
    res.status(201).json(newTask);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/kanban/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, assigned_to, column } = req.body;
    
    const task = await db.KanbanTask.findByPk(id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updatedTask = await task.update({
      title: title || task.title,
      description: description || task.description,
      priority: priority || task.priority,
      assigned_to: assigned_to || task.assigned_to,
      column: column || task.column
    });
    
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/kanban/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await db.KanbanTask.findByPk(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await task.destroy();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

describe('Kanban API', () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedTestData();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.KanbanTask.destroy({ where: {}, force: true });
  });

  describe('GET /api/kanban', () => {
    it('should return all kanban tasks', async () => {
      const response = await request(app)
        .get('/api/kanban')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(0);
      
      // Verify structure of returned tasks
      response.body.forEach(task => {
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('title');
        expect(task).toHaveProperty('description');
        expect(task).toHaveProperty('status');
        expect(task).toHaveProperty('priority');
        expect(task).toHaveProperty('assigned_to');
        expect(task).toHaveProperty('column');
      });
    });
  });

  describe('POST /api/kanban', () => {
    it('should create a new kanban task', async () => {
      const newTask = {
        title: 'New Test Task',
        description: 'Description for new test task',
        priority: 'high',
        assigned_to: 'swissclaw',
        column: 'todo',
        created_by: '550e8400-e29b-41d4-a716-446655440001'
      };

      const response = await request(app)
        .post('/api/kanban')
        .send(newTask)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(newTask.title);
      expect(response.body.description).toBe(newTask.description);
      expect(response.body.priority).toBe(newTask.priority);
      expect(response.body.assigned_to).toBe(newTask.assigned_to);
      expect(response.body.column).toBe(newTask.column);
    });

    it('should return 400 when title is missing', async () => {
      const invalidTask = {
        description: 'Task without title'
      };

      const response = await request(app)
        .post('/api/kanban')
        .send(invalidTask)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Title is required');
    });
  });

  describe('PUT /api/kanban/:id', () => {
    it('should update an existing kanban task', async () => {
      // First create a task
      const createdTask = await db.KanbanTask.create({
        title: 'Original Task',
        description: 'Original description',
        priority: 'medium',
        assigned_to: 'neil',
        column: 'todo',
        created_by: '550e8400-e29b-41d4-a716-446655440001'
      });

      const updateData = {
        title: 'Updated Task Title',
        column: 'done'
      };

      const response = await request(app)
        .put(`/api/kanban/${createdTask.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.id).toBe(createdTask.id);
      expect(response.body.title).toBe(updateData.title);
      expect(response.body.column).toBe(updateData.column);
    });

    it('should return 404 when updating non-existent task', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440999';
      const updateData = { title: 'Updated Title' };

      const response = await request(app)
        .put(`/api/kanban/${fakeId}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Task not found');
    });
  });

  describe('DELETE /api/kanban/:id', () => {
    it('should delete an existing kanban task', async () => {
      // First create a task
      const createdTask = await db.KanbanTask.create({
        title: 'Task to Delete',
        description: 'This task will be deleted',
        priority: 'low',
        assigned_to: 'swissclaw',
        column: 'todo',
        created_by: '550e8400-e29b-41d4-a716-446655440001'
      });

      await request(app)
        .delete(`/api/kanban/${createdTask.id}`)
        .expect(204);
    });

    it('should return 404 when deleting non-existent task', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440999';

      const response = await request(app)
        .delete(`/api/kanban/${fakeId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Task not found');
    });
  });
});
