import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Swissclaw Hub API',
      version: '2.1.0',
      description: 'Dashboard API for Swissclaw Hub — kanban board, chat, activities, and status.',
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Session token from POST /api/login',
        },
        ServiceToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Service-Token',
          description: 'Service-to-service authentication token',
        },
      },
      schemas: {
        KanbanTask: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            taskId: { type: 'string', example: 'TASK-ABC123' },
            title: { type: 'string', maxLength: 200 },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            assignedTo: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            attachmentCount: { type: 'integer' },
            commentCount: { type: 'integer' },
            position: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        KanbanColumn: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'todo' },
            displayName: { type: 'string', example: 'To Do' },
            emoji: { type: 'string' },
            color: { type: 'string' },
            position: { type: 'integer' },
          },
        },
        Activity: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            type: { type: 'string', maxLength: 50 },
            description: { type: 'string', maxLength: 500 },
            metadata: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        ChatMessage: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            sender: { type: 'string', maxLength: 50 },
            content: { type: 'string', maxLength: 5000 },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        BuildInfo: {
          type: 'object',
          properties: {
            version: { type: 'string', example: '2.1.0' },
            commit: { type: 'string', example: 'abc1234' },
            buildTime: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./server/index.ts', './server/routes/auth.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
