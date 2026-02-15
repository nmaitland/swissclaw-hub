# Testing Guide

## Overview

Backend tests use Jest and run against the **real Express app** in `server/index.ts` and a **PostgreSQL** database. The server uses `pg` (not Sequelize) at runtime; database schema is managed by Sequelize migrations. Tests call `resetTestDb()` which truncates all tables and re-inserts default kanban columns. Server code is TypeScript — Jest uses `ts-jest` to transform `.ts` files and `babel-jest` for `.js` files.

## Test Structure

```
tests/
├── unit/                              # Unit tests (mocked dependencies, no DB required)
│   ├── auth-middleware.test.js        # Session store, input validation, CSRF
│   ├── database-config.test.js        # Database configuration logic
│   └── security-middleware.test.js     # Security headers, rate limiting, XSS
├── api/
│   └── kanban-mock.test.js            # Contract test (real server, needs DB)
├── integration/                       # Full flow tests (real server + DB)
│   ├── setup.js                       # Shared test setup utilities
│   ├── activities.test.js             # Activity CRUD and broadcasting
│   ├── auth.test.js                   # Login/logout flow
│   ├── auth-edge-cases.test.js        # Auth edge cases and error handling
│   ├── health.test.js                 # Health check endpoint
│   ├── kanban.test.js                 # Kanban CRUD operations
│   ├── kanban-simple.test.js          # Basic kanban operations
│   ├── kanban-edge-cases.test.js      # Kanban error handling
│   ├── kanban-ordering.test.js        # Task ordering and rebalancing
│   ├── messages.test.js               # Chat message operations
│   ├── messages-extended.test.js      # Extended message scenarios
│   ├── status.test.js                 # Status endpoint
│   └── tasks-legacy.test.js           # Legacy task parsing from kanban.md
└── zzz-teardown.test.js               # Runs last; closes pg pool and Socket.io
```

Client tests:
```
client/src/
├── __tests__/
│   └── App.test.js                    # App component tests
└── components/__tests__/
    └── KanbanBoard.test.js            # KanbanBoard component tests
```

## Database Setup

### Local: Docker (recommended)

1. Start test database (Postgres 15 on port 5433):

   ```bash
   docker-compose -f docker-compose.test.yml up -d test-db
   ```

2. Run migrations to create the schema:

   ```bash
   npm run db:migrate:test
   ```

3. (Optional) Run seeders for test data:

   ```bash
   npm run db:seed:test
   ```

4. Run all backend tests:

   ```bash
   npm run test:with-db
   ```

   With coverage: `npm run test:with-db -- --coverage`

5. Stop test database:

   ```bash
   docker-compose -f docker-compose.test.yml down
   ```

### CI (GitHub Actions)

The workflow starts a Postgres service and sets `NODE_ENV=test` and `TEST_DB_*`. It runs `npm run db:migrate:test` to create the schema, then `npm test` with coverage. The database schema is managed via Sequelize migrations.

### Env vars for backend tests

- `NODE_ENV=test` so the server uses test DB when `DATABASE_URL` is unset.
- Either set `DATABASE_URL` or:
  - `TEST_DB_HOST` (default localhost)
  - `TEST_DB_PORT` (default 5433)
  - `TEST_DB_NAME` (default swissclaw_hub_test)
  - `TEST_DB_USER` / `TEST_DB_PASSWORD`

## Running Tests

### All backend tests (requires Postgres)

```bash
npm test
```

Set the env vars above (e.g. `npm run test:with-db` which sets them for local Docker).

### With coverage

```bash
npm run test:coverage
```

Or `npm test -- --coverage` (requires env vars if no `.env`).

### Unit tests (no DB required)

```bash
npm run test:unit
```

Runs `tests/unit/` — these use mocked dependencies and do **not** require a running database.

> **Note:** Despite the name, `test:unit` currently also includes `tests/api/` which does need a DB. True unit tests are in `tests/unit/` only.

### Integration tests

```bash
npm run test:integration
```

Runs `tests/integration/` — full flow tests against the real server and database.

### Watch mode

```bash
npm run test:watch
```

### Client (React) tests

```bash
npm run test:client
```

## Backend test strategy

All backend integration and API tests use the real `server/index.ts` app and a real Postgres database:

1. `beforeAll` calls `resetTestDb()` which truncates `kanban_tasks`, `kanban_columns`, `messages`, and `activities` tables (with `RESTART IDENTITY CASCADE`), then re-inserts the 6 default kanban columns.
2. Tests use `supertest` against the exported `app`.
3. No mocks for the server or DB; coverage includes real API and DB code.

Unit tests in `tests/unit/` mock database and middleware dependencies to test logic in isolation.

## Why `--forceExit`?

Backend tests require the real server (`server/index.ts`), which creates a **pg Pool** and **Socket.io** server. A dedicated teardown suite (`tests/zzz-teardown.test.js`) runs last and closes the pool and Socket.io so DB connections and WebSocket server are released. The Node process can still be kept alive by other handles (e.g. timers inside `pg` or `express-rate-limit`), so the npm scripts and CI use **`--forceExit`** so Jest exits after tests. The teardown is still valuable: it closes the pool and io explicitly so connections do not linger.

## Writing new tests

- **Unit tests**: `tests/unit/*.test.js` — mock dependencies, test logic in isolation. No DB required.
- **Contract/API tests**: `tests/api/*.test.js` — quick checks that routes respond with expected shape. Requires DB.
- **Integration tests**: `tests/integration/*.test.js` — full flows (create task, then GET, etc.). Requires DB.
- Use `const { app, resetTestDb, pool } = require('../../server/index');` and `beforeAll(() => resetTestDb());` (path is `../../server/index` from both `tests/api` and `tests/integration`).

## Troubleshooting

### Database connection errors

Start Postgres first (e.g. Docker), then run `npm run test:with-db` or set `NODE_ENV=test` and `TEST_DB_*` and run `npm test`.

### Schema errors (e.g. "relation does not exist")

The database schema is created by Sequelize migrations. Run `npm run db:migrate:test` before running tests. If you see schema errors, ensure migrations have been run against the test database.

### Wrong data (e.g. stale rows from previous test run)

`resetTestDb()` truncates all tables and re-inserts default kanban columns. Ensure tests call `resetTestDb()` in `beforeAll`. If you see unexpected data, check that no other process is writing to the same test database.

### TextEncoder/TextDecoder

Jest config provides these via Node's `util`.
