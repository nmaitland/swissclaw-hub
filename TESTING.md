# Testing Guide

## Overview

Backend tests use Jest and run against the **real Express app** in `server/index.ts` and a **PostgreSQL** database. The server uses `pg` (not Sequelize) at runtime; tests call `resetTestDb()` so the DB has the server's schema (messages, activities, kanban_columns, kanban_tasks). Server code is TypeScript — Jest uses `ts-jest` to transform `.ts` files and `babel-jest` for `.js` files.

## Test Structure

```
tests/
├── api/
│   └── kanban-mock.test.js    # Contract test (real server, needs DB)
├── integration/
│   ├── kanban-simple.test.js
│   ├── kanban.test.js
│   ├── status.test.js
│   └── setup.js               # Legacy Sequelize setup (unused by current tests)
└── zzz-teardown.test.js       # Runs last; closes pg pool and Socket.io
```

## Database Setup

### Local: Docker (recommended)

1. Start test database (Postgres 15 on port 5433):

   ```bash
   docker-compose -f docker-compose.test.yml up -d test-db
   ```

2. Run all backend tests (schema is applied via `resetTestDb()`):

   ```bash
   npm run test:with-db
   ```

   With coverage: `npm run test:with-db -- --coverage`

3. Stop test database:

   ```bash
   docker-compose -f docker-compose.test.yml down
   ```

### CI (GitHub Actions)

The workflow starts a Postgres service and sets `NODE_ENV=test` and `TEST_DB_*`. A single step runs `npm test` with coverage; no Sequelize migrations are run—the server’s `initDb()` creates the schema.

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

### Unit vs integration

- `npm run test:unit` – only `tests/api` (still hits real server, so DB required).
- `npm run test:integration` – only `tests/integration`.

Both need a running Postgres and the env vars above.

### Watch mode

```bash
npm run test:watch
```

### Why `--forceExit`?

Backend tests require the real server (`server/index.ts`), which creates a **pg Pool** and **Socket.io** server. A dedicated teardown suite (`tests/zzz-teardown.test.js`) runs last and closes the pool and Socket.io so DB connections and WebSocket server are released. The Node process can still be kept alive by other handles (e.g. timers inside `pg` or `express-rate-limit`), so the npm scripts and CI use **`--forceExit`** so Jest exits after tests. The teardown is still valuable: it closes the pool and io explicitly so connections do not linger.

### Client (React) tests

```bash
npm run test:client
```

## Backend test strategy

All backend tests use the real `server/index.ts` app and a real Postgres database:

1. `beforeAll` calls `resetTestDb()` (drops server tables and runs `initDb()`).
2. Tests use `supertest` against the exported `app`.
3. No mocks for the server or DB; coverage includes real API and DB code.

## Writing new tests

- **Contract/API tests**: `tests/api/*.test.js` – quick checks that routes respond with expected shape.
- **Integration tests**: `tests/integration/*.test.js` – full flows (create task, then GET, etc.).
- Use `const { app, resetTestDb, pool } = require('../../server/index');` and `beforeAll(() => resetTestDb());` (path is `../../server/index` from both `tests/api` and `tests/integration`).

## Troubleshooting

### Database connection errors

Start Postgres first (e.g. Docker), then run `npm run test:with-db` or set `NODE_ENV=test` and `TEST_DB_*` and run `npm test`.

### Wrong schema (e.g. "column sender does not exist")
The server expects tables created by its `initDb()` (e.g. `messages.sender`). `resetTestDb()` drops and recreates those tables. If you see schema errors, ensure tests call `resetTestDb()` in `beforeAll` and that no other process is using Sequelize migrations on the same DB for these tests.

### TextEncoder/TextDecoder
Jest config provides these via Node’s `util`.
