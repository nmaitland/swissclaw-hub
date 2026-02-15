# Documentation, Swagger & MCP Audit Plan

**Date:** 2026-02-14  
**Scope:** All markdown docs, Swagger/OpenAPI definitions, MCP server, and config files

---

## Findings Summary

After cross-referencing every documentation file, the Swagger config, the MCP server, and the actual codebase, here are all the issues found:

---

## 1. README.md

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Database description contradicts itself** | Line 52 says "PostgreSQL database with raw SQL (no ORM at runtime)" but line 76 says "The project uses Sequelize migrations for database schema management." Both are true but the Features section should mention migrations too. |
| 2 | **Hosting tier wrong** | Line 72 says "Render (Pro plan)" but `docs/requirements.md` line 20 says "Render (free tier)" and `docs/requirements-architecture.md` line 14 says "Render (free tier, auto-deploy from master)". The `render.yaml` confirms `plan: pro`. README is correct; the other docs are stale. |
| 3 | **Missing env vars in table** | The env vars table (lines 196-203) is missing `SESSION_SECRET`, `REACT_APP_API_URL`, and `SWISSCLAW_AUTH_TOKEN`. The `.env.example` is also incomplete — it lacks `AUTH_USERNAME`, `AUTH_PASSWORD`, and `SWISSCLAW_TOKEN`. |
| 4 | **Test structure tree is incomplete** | The test tree (lines 38-42) is missing many test files that now exist: `tests/integration/activities.test.js`, `tests/integration/auth.test.js`, `tests/integration/auth-edge-cases.test.js`, `tests/integration/kanban-edge-cases.test.js`, `tests/integration/kanban-ordering.test.js`, `tests/integration/messages.test.js`, `tests/integration/messages-extended.test.js`, `tests/integration/health.test.js`, `tests/integration/tasks-legacy.test.js`, and `tests/unit/auth-middleware.test.js`, `tests/unit/database-config.test.js`, `tests/unit/security-middleware.test.js`. |
| 5 | **Start command incomplete** | Line 25 says start command is `npm run db:migrate && npm start` but the actual `package.json` `start` script already includes `npm run db:migrate && npm run server`, so the deployment section is redundant/confusing. |
| 6 | **Auth routes not mentioned** | The `server/routes/auth.ts` file provides enhanced auth endpoints (`/auth/login`, `/auth/logout`, `/auth/validate`, `/auth/me`, `/auth/change-password`) but these are not documented in the README at all. |
| 7 | **Missing server files in tree** | The project structure tree doesn't show `server/lib/errors.ts` or `server/lib/logger.ts` — wait, it does (lines 22-23). But it's missing `config/database.js` (Sequelize config), `database/migrations/`, `.sequelizerc`, and `docker-compose.test.yml`. |

### Fixes Required
- Update test structure tree to include all current test files
- Add note about Sequelize migrations in Features section
- Update env vars table to include all variables from actual code
- Mention enhanced auth routes
- Update project structure to include database migration infrastructure

---

## 2. TESTING.md

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Test structure tree is severely outdated** | Only shows 4 files but there are now 16+ test files across `tests/unit/`, `tests/api/`, and `tests/integration/`. |
| 2 | **Says "resetTestDb() drops server tables and runs initDb()"** | Line 111 — but `resetTestDb()` in `server/index.ts` actually does `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` and re-inserts default kanban columns. It does NOT call `initDb()` (which doesn't exist anymore). Tables are created by Sequelize migrations. |
| 3 | **Says "setup.js — Legacy Sequelize setup (unused by current tests)"** | This may still be accurate but should be verified or the file removed. |
| 4 | **"Wrong schema" troubleshooting is outdated** | Line 126 says "resetTestDb() drops and recreates those tables" — it actually truncates, not drops. The advice about Sequelize migrations conflicting is also outdated since migrations are now the primary schema management. |
| 5 | **Missing unit test section** | `tests/unit/` directory now has `auth-middleware.test.js`, `database-config.test.js`, `security-middleware.test.js` — these are true unit tests with mocks, but the doc says "test:unit — only tests/api (still hits real server, so DB required)". This is wrong. |
| 6 | **Missing migration step in setup** | The "Database Setup" section should mention running migrations before tests, which is now required. The CI workflow does this (`npm run db:migrate:test`). |

### Fixes Required
- Rewrite test structure tree
- Fix `resetTestDb()` description
- Fix unit vs integration description
- Add migration step to setup instructions
- Update troubleshooting section

---

## 3. docs/requirements.md

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Hosting says "Render (free tier)"** | Should be "Render (Pro plan)" per `render.yaml`. |
| 2 | **Backlog item "Database migrations" is done** | Line 28 says "Database migrations (Sequelize or alternative) — replace initDb() approach" — this is now implemented via Sequelize migrations in `database/migrations/`. Should be moved to Implemented. |

### Fixes Required
- Fix hosting tier
- Move database migrations to Implemented section

---

## 4. docs/requirements-architecture.md

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Hosting says "Render (free tier, auto-deploy from master)"** | Should be "Render (Pro plan)". |
| 2 | **Data model is incomplete** | Missing columns that exist in the actual migrations: `kanban_tasks` is missing `task_id`, `assigned_to`, `tags`, `attachment_count`, `comment_count`. `kanban_columns` is missing `display_name`, `emoji`, `color`. `sessions` is missing `last_accessed_at`, `revoked_at`. Also missing the `users` table and `status` table entirely. |

### Fixes Required
- Fix hosting tier
- Update data model to match actual migration schema

---

## 5. docs/ideas.md

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **"Database migrations (replace initDb approach)" is still in Backlog** | This is now implemented. Should be moved to Implemented. |

### Fixes Required
- Move database migrations to Implemented section

---

## 6. docs/project-info.md

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Missing version entry for current state** | The versions table stops at V4 (2026-02-12). Should add entries for migration infrastructure, task ordering, etc. |
| 2 | **Missing `REACT_APP_API_URL` explanation** | Listed in env vars but not in README env table. |

### Fixes Required
- Add version entry for V4.1 or similar covering migration work and task ordering

---

## 7. .env.example

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Missing critical env vars** | Does not include `AUTH_USERNAME`, `AUTH_PASSWORD`, `SWISSCLAW_TOKEN`, `SWISSCLAW_AUTH_TOKEN`. These are all used in the server code. |

### Fixes Required
- Add all missing environment variables with example/placeholder values

---

## 8. server/config/swagger.ts — Swagger/OpenAPI

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Missing `/api/kanban/reorder` endpoint** | This POST endpoint exists in `server/index.ts` (line 898) with full Swagger JSDoc annotations, but the swagger config `apis` array only scans `./server/index.ts` and `./server/routes/auth.ts`, so it should be picked up. Verify it renders correctly. |
| 2 | **KanbanColumn schema incomplete** | Missing `id` field. The actual API response includes `name`, `displayName`, `emoji`, `color`, `position` — the schema has these but is missing `id`. |
| 3 | **KanbanTask schema missing `columnName`** | The API response from GET `/api/kanban` groups tasks by column name, but individual task objects don't include `columnName`. However, the PUT response includes `rebalanced` field which is not in the schema. |
| 4 | **Missing `/api/activities` POST endpoint documentation** | Wait — it IS documented via JSDoc in `server/index.ts` line 1087. Should be picked up by swagger-jsdoc. |
| 5 | **Auth routes use `/auth/*` paths** | The Swagger annotations in `server/routes/auth.ts` use paths like `/auth/login`, `/auth/logout`, etc. But the router is never mounted in `server/index.ts` — there's no `app.use('/auth', authRouter)`. These routes may not actually work! This is a code issue, not just docs. |
| 6 | **Version mismatch** | Swagger says version `2.1.0`, `server/index.ts` `getBuildInfo()` also says `2.1.0`, but `package.json` says `1.0.0`. These should be consistent. |
| 7 | **Missing `rebalanced` field in PUT response schema** | The PUT `/api/kanban/tasks/:id` response includes a `rebalanced` boolean field not documented in the schema. |
| 8 | **Missing `targetTaskId` and `insertAfter` in PUT request schema** | The PUT handler accepts `targetTaskId` and `insertAfter` in the request body but these aren't in the Swagger docs. |

### Fixes Required
- Add `rebalanced`, `targetTaskId`, `insertAfter` to PUT task schema
- Fix version consistency between swagger, server, and package.json
- Verify auth routes are actually mounted (code issue)
- Add missing fields to KanbanTask/KanbanColumn schemas

---

## 9. server/mcp-server.ts — MCP Server

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **`send_message` doesn't actually send a chat message** | It posts to `/api/service/activities` with type `chat`, but this creates an activity record, not a message in the `messages` table. The tool description says "Send a chat message as Swissclaw (broadcasts via Socket.io)" but it only broadcasts an activity, not a chat message. |
| 2 | **Missing `SWISSCLAW_AUTH_TOKEN` in .mcp.json** | The MCP server supports `SWISSCLAW_AUTH_TOKEN` env var but `.mcp.json` doesn't include it. For local dev this is fine (auth not required), but should be documented. |
| 3 | **No tool for `/api/kanban/reorder`** | The reorder endpoint exists but has no MCP tool. |
| 4 | **No tool for `/api/activities` POST** | There's `add_activity` which uses `/api/service/activities`, but the regular `/api/activities` POST endpoint is not exposed. |

### Fixes Required
- Fix `send_message` tool description or implementation to clarify it creates an activity, not a direct message
- Consider adding `reorder_tasks` MCP tool
- Document `SWISSCLAW_AUTH_TOKEN` in `.mcp.json` as a comment or in docs

---

## 10. .sequelizerc.json

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Production config has hardcoded localhost credentials** | Lines 21-28 show production config with `localhost`, `postgres/password`. This is never used (the actual Sequelize config is in `config/database.js` which reads `DATABASE_URL`), but it's misleading. This file appears to be unused — `.sequelizerc` points to `config/database.js`. |

### Fixes Required
- Delete `.sequelizerc.json` if unused, or fix production config

---

## 11. docs/mcp-server.md

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **Generally accurate** | This doc is well-maintained and matches the actual MCP server code. |
| 2 | **Minor: says "9 tools"** | Line 3 says "exposes 9 tools" — count in code: `get_status`, `get_messages`, `send_message`, `get_kanban`, `create_task`, `update_task`, `delete_task`, `add_activity`, `get_build_info` = 9. Correct. |

### No fixes required

---

## 12. docs/betterstack.md and docs/betterstack-test.md

### Issues Found

| # | Issue | Details |
|---|-------|---------|
| 1 | **betterstack.md uses different API endpoint** | Uses `https://telemetry.betterstack.com/api/v2/query/` but `betterstack-test.md` uses `https://eu-fsn-3-connect.betterstackdata.com`. The test doc appears to have the correct working endpoint. |
| 2 | **betterstack.md uses Bearer auth** | Line 47 uses `Authorization: Bearer $USER:$PASS` but `betterstack-test.md` uses `-u "$USER:$PASS"` (HTTP Basic Auth). The test doc is confirmed working. |

### Fixes Required
- Update `betterstack.md` to use the confirmed working endpoint and auth method from `betterstack-test.md`

---

## Priority Order for Implementation

1. **`.env.example`** — Quick fix, high impact for new developers
2. **`README.md`** — Primary entry point, most visible
3. **`TESTING.md`** — Critical for test workflow accuracy
4. **`server/config/swagger.ts`** — API contract accuracy
5. **`docs/requirements.md`** — Fix stale backlog
6. **`docs/requirements-architecture.md`** — Fix data model
7. **`docs/ideas.md`** — Fix stale backlog
8. **`docs/project-info.md`** — Add version entry
9. **`docs/betterstack.md`** — Fix API endpoint/auth
10. **`server/mcp-server.ts`** — Fix send_message description
11. **`.sequelizerc.json`** — Delete or fix
12. **`package.json`** — Align version number

---

## Code Issues Discovered (Not Documentation)

> **Status:** Flagged for future work. These are actual code bugs found during the audit.
> Documentation and Swagger fixes have been applied; these code issues are deferred.

1. **`server/routes/auth.ts` is never mounted** — The enhanced auth router is defined but `server/index.ts` never calls `app.use('/auth', authRouter)`. These routes are dead code. To fix: add `import authRouter from './routes/auth';` and `app.use('/auth', authRouter);` in `server/index.ts`.
2. **`server/config/database.ts` creates a separate pool** — This file creates its own `Pool` instance, but `server/index.ts` also creates its own pool. The auth routes import from `server/config/database.ts` but the main server uses its own pool. If auth routes were mounted, they'd use a different DB connection pool. To fix: consolidate to a single pool, either by having `server/index.ts` import from `server/config/database.ts` or vice versa.
3. **`send_message` MCP tool doesn't send messages** — It creates an activity, not a chat message. The tool description has been updated to clarify this behavior. To actually send chat messages, the tool would need to call a different endpoint or use Socket.io directly.

## Fixes Applied (Documentation Audit)

| # | File | Change |
|---|------|--------|
| 1 | `.env.example` | Added `AUTH_USERNAME`, `AUTH_PASSWORD`, `SWISSCLAW_TOKEN`, `SWISSCLAW_AUTH_TOKEN` |
| 2 | `README.md` | Full rewrite: updated project structure tree, test tree, env vars table, scripts table, features list, migration docs |
| 3 | `TESTING.md` | Full rewrite: updated test tree, fixed `resetTestDb()` description, fixed unit vs integration, added migration step |
| 4 | `server/config/swagger.ts` | Added `rebalanced` to KanbanTask schema, added `id` to KanbanColumn schema |
| 5 | `server/index.ts` | Added `targetTaskId`, `insertAfter`, `rebalanced` to PUT task JSDoc |
| 6 | `package.json` | Version aligned to `2.1.0` |
| 7 | `docs/requirements.md` | Moved database migrations to Implemented, fixed hosting tier to Pro |
| 8 | `docs/requirements-architecture.md` | Fixed hosting tier, completed data model with all columns and tables |
| 9 | `docs/ideas.md` | Moved database migrations to Implemented |
| 10 | `docs/project-info.md` | Added V4.1 version entry |
| 11 | `docs/betterstack.md` | Fixed API endpoint and auth method to match confirmed working test |
| 12 | `server/mcp-server.ts` | Fixed `send_message` tool description |
| 13 | `docs/mcp-server.md` | Fixed `send_message` description to match |
| 14 | `.sequelizerc.json` | Deleted (unused, misleading production config) |
