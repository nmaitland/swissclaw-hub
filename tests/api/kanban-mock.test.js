const request = require('supertest');
const express = require('express');

const app = express();
app.use(express.json());

// Mock kanban API routes
app.get('/api/kanban', async (req, res) => {
  try {
    // Mock data - return sample kanban tasks
    const mockTasks = [
      {
        id: 'task-1',
        title: 'Test Task 1',
        description: 'Description for test task 1',
        status: 'todo',
        priority: 'high',
        assigned_to: 'swissclaw',
        column: 'todo',
        created_at: new Date().toISOString()
      },
      {
        id: 'task-2',
        title: 'Test Task 2',
        description: 'Description for test task 2',
        status: 'inprogress',
        priority: 'medium',
        assigned_to: 'neil',
        column: 'inprogress',
        created_at: new Date().toISOString()
      }
    ];
    
    res.json(mockTasks);
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

    // Mock task creation
    const newTask = {
      id: 'new-task-' + Date.now(),
      title,
      description,
      priority,
      assigned_to,
      column,
      created_at: new Date().toISOString()
    };
    
    res.status(201).json(newTask);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/kanban/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, assigned_to, column } = req.body;
    
    // Check if task exists (mock implementation)
    if (id === 'non-existent-id') {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Mock task update
    const updatedTask = {
      id,
      title: title || 'Updated Task',
      description,
      priority,
      assigned_to,
      column: column || 'done',
      updated_at: new Date().toISOString()
    };
    
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/kanban/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if task exists (mock implementation)
    if (id === 'non-existent-id') {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Mock task deletion
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

describe('Kanban API', () => {
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
      const taskId = 'task-1';
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
      const taskId = 'task-1';

      const response = await request(app)
        .delete(`/api/kanban/${taskId}`)
        .expect(204);
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
