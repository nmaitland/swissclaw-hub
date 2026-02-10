const request = require('supertest');
const express = require('express');
const { testPool, setupTestDb, seedTestData } = require('../setup');

const app = express();
app.use(express.json());

// Mock kanban API routes
app.get('/api/kanban', async (req, res) => {
  try {
    const result = await testPool.query('SELECT * FROM kanban_tasks ORDER BY created_at DESC');
    res.json(result.rows);
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

    const result = await testPool.query(
      `INSERT INTO kanban_tasks (id, title, description, priority, assigned_to, column, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [title, description, priority, assigned_to, column]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/kanban/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, assigned_to, column } = req.body;
    
    const result = await testPool.query(
      `UPDATE kanban_tasks 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           priority = COALESCE($3, priority),
           assigned_to = COALESCE($4, assigned_to),
           column = COALESCE($5, column),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [title, description, priority, assigned_to, column, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/kanban/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await testPool.query(
      'DELETE FROM kanban_tasks WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
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

  afterAll(async () => {
    await testPool.end();
  });

  beforeEach(async () => {
    await setupTestDb();
    await seedTestData();
  });

  describe('GET /api/kanban', () => {
    it('should return all kanban tasks', async () => {
      const response = await request(app)
        .get('/api/kanban')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Check structure of returned tasks
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
        column: 'todo'
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
      // First, get a task to update
      const getResponse = await request(app)
        .get('/api/kanban')
        .expect(200);
      
      const taskId = getResponse.body[0].id;
      const updateData = {
        title: 'Updated Task Title',
        column: 'done'
      };

      const response = await request(app)
        .put(`/api/kanban/${taskId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.id).toBe(taskId);
      expect(response.body.title).toBe(updateData.title);
      expect(response.body.column).toBe(updateData.column);
    });

    it('should return 404 when updating non-existent task', async () => {
      const fakeId = 'non-existent-id';
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
      // First, get a task to delete
      const getResponse = await request(app)
        .get('/api/kanban')
        .expect(200);
      
      const taskId = getResponse.body[0].id;

      await request(app)
        .delete(`/api/kanban/${taskId}`)
        .expect(204);

      // Verify task is deleted
      await request(app)
        .get('/api/kanban')
        .expect(200);

      // The deleted task should no longer be in the results
      const tasks = await testPool.query('SELECT * FROM kanban_tasks WHERE id = $1', [taskId]);
      expect(tasks.rows.length).toBe(0);
    });

    it('should return 404 when deleting non-existent task', async () => {
      const fakeId = 'non-existent-id';

      const response = await request(app)
        .delete(`/api/kanban/${fakeId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Task not found');
    });
  });
});
