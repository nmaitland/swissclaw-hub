const request = require('supertest');
const { app, resetTestDb } = require('../../server/index');

/**
 * Additional integration tests around the real Kanban API, focused on
 * behaviour such as idempotency and basic listing after mutations.
 */

describe('Kanban API (behavioural)', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('lists tasks after creating one', async () => {
    const createResponse = await request(app)
      .post('/api/kanban/tasks')
      .send({
        columnName: 'todo',
        title: 'List-after-create Task',
        description: 'Task created to verify listing',
      })
      .expect(201);

    const createdId = createResponse.body.id;

    const listResponse = await request(app)
      .get('/api/kanban')
      .expect(200);

    const { columns, tasks } = listResponse.body;
    const allTasks = columns.flatMap((col) => tasks[col.name]);

    const found = allTasks.find((t) => t.id === createdId);
    expect(found).toBeDefined();
    expect(found.title).toBe('List-after-create Task');
  });

  it('reflects column changes when moving a task', async () => {
    const createResponse = await request(app)
      .post('/api/kanban/tasks')
      .send({
        columnName: 'todo',
        title: 'Move-me Task',
      })
      .expect(201);

    const taskId = createResponse.body.id;

    await request(app)
      .put(`/api/kanban/tasks/${taskId}`)
      .send({ columnName: 'done' })
      .expect(200);

    const listResponse = await request(app)
      .get('/api/kanban')
      .expect(200);

    const { tasks } = listResponse.body;
    const inTodo = (tasks.todo || []).find((t) => t.id === taskId);
    const inDone = (tasks.done || []).find((t) => t.id === taskId);

    expect(inTodo).toBeUndefined();
    expect(inDone).toBeDefined();
  });
});
