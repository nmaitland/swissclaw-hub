import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Swissclaw Hub API',
      version: '0.0.0',
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
            sender: { type: 'string', maxLength: 50, nullable: true },
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
            buildDate: { type: 'string', format: 'date-time', example: '2026-02-15T06:53:46.312Z' },
            commit: { type: 'string', example: 'abc1234' },
          },
        },
        ModelUsageCostBucket: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['paid', 'free_tier_potential'] },
            amount: { type: 'number', format: 'decimal', example: 0.9465 },
          },
        },
        ModelUsageModel: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            provider: { type: 'string', nullable: true },
            source: { type: 'string', nullable: true },
            inputTokens: { type: 'integer' },
            outputTokens: { type: 'integer' },
            totalTokens: { type: 'integer' },
            requestCount: { type: 'integer' },
            costs: {
              type: 'array',
              items: { $ref: '#/components/schemas/ModelUsageCostBucket' },
            },
          },
        },
        ModelUsageTotals: {
          type: 'object',
          properties: {
            inputTokens: { type: 'integer' },
            outputTokens: { type: 'integer' },
            totalTokens: { type: 'integer' },
            requestCount: { type: 'integer' },
            costs: {
              type: 'array',
              items: { $ref: '#/components/schemas/ModelUsageCostBucket' },
            },
          },
        },
        ModelUsageSnapshot: {
          type: 'object',
          properties: {
            usageDate: { type: 'string', format: 'date' },
            updatedAt: { type: 'string', format: 'date-time' },
            models: {
              type: 'array',
              items: { $ref: '#/components/schemas/ModelUsageModel' },
            },
            totals: { $ref: '#/components/schemas/ModelUsageTotals' },
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
