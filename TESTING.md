# Testing Guide

## Overview

This project uses Jest for testing with a clear separation between unit tests and integration tests. Database management is handled by Sequelize ORM with PostgreSQL.

## Test Structure

```
tests/
├── api/                    # Unit tests with mocked dependencies
│   └── kanban-mock.test.js
└── integration/           # Integration tests (require database)
    ├── kanban-simple.test.js
    ├── status.test.js
    └── setup.js
```

## Database Setup

### Using Docker (Recommended for Integration Tests)

1. **Start test database**:
```bash
docker-compose -f docker-compose.test.yml up -d test-db
```

2. **Setup test database schema**:
```bash
npm run db:setup:test
```

3. **Run integration tests**:
```bash
npm run test:integration
```

4. **Stop test database**:
```bash
docker-compose -f docker-compose.test.yml down
```

### Database Scripts

- `npm run db:migrate` - Run migrations
- `npm run db:migrate:undo` - Undo last migration
- `npm run db:seed` - Run all seeders
- `npm run db:seed:undo` - Undo all seeders
- `npm run db:setup:test` - Setup test database (migrate + seed)
- `npm run db:reset:test` - Reset test database (undo all + migrate + seed)

## Running Tests

### Unit Tests (Recommended for CI/CD)
```bash
npm run test:unit
```
- Fast execution
- No database required
- Uses mocked dependencies
- Currently: 7 passing tests

### Integration Tests
```bash
npm run test:integration
```
- Requires PostgreSQL database
- Tests real database interactions
- Uses Sequelize models
- Requires Docker database setup

### All Tests
```bash
npm test
```
- Runs unit tests only (integration tests excluded by config)

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Unit Testing Strategy

Unit tests use mocked Express apps and database connections to test API logic without external dependencies. Example:

```javascript
const request = require('supertest');
const express = require('express');

const app = express();
app.use(express.json());

// Mock API routes
app.get('/api/kanban', async (req, res) => {
  // Mock implementation
});
```

## Integration Testing Strategy

Integration tests use real Sequelize models and database connections. The setup file (`tests/integration/setup.js`) provides:

- Database connection management
- Table creation/migration
- Test data seeding
- Cleanup functions

Example integration test structure:

```javascript
const { setupTestDb, teardownTestDb, seedTestData, db } = require('./setup');

describe('Kanban API Integration', () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedTestData();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // Tests using real database
});
```

## Sequelize Models

The project uses the following models:

- **User** - User accounts and authentication
- **KanbanTask** - Kanban board tasks
- **Message** - Chat messages
- **Activity** - Activity logs
- **SecurityLog** - Security event logging

## Writing New Tests

### Unit Tests
- Place in `tests/api/` directory
- Use mocked dependencies
- Test business logic, not external services
- Follow naming pattern: `*.test.js`

### Integration Tests
- Place in `tests/integration/` directory
- Use real database connections via Sequelize
- Test complete API workflows
- Import setup utilities from `tests/integration/setup.js`

## Current Status

✅ **Completed**:
- Jest configuration with proper setup
- Unit tests with mocked database
- Separation of unit and integration tests
- Sequelize ORM integration
- Database migrations and seeders
- Docker test environment
- Test scripts in package.json

🔄 **In Progress**:
- Integration test execution with Docker

⏳ **Pending**:
- Client-side React component tests

## Troubleshooting

### Database Connection Errors
Integration tests will fail without a test database. Start the Docker container first:
```bash
docker-compose -f docker-compose.test.yml up -d test-db
```

### Migration Issues
Reset the test database:
```bash
npm run db:reset:test
```

### TextEncoder/TextDecoder Issues
These are automatically polyfilled in the Jest configuration.

### ESLint Errors
Some test files may have unused variables - these are intentional for test structure.
