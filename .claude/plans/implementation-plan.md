# Swissclaw Hub - Updated Implementation Plan

## Context

Reviewing and updating the existing `.windsurf/plans/testing-implementation-plan.md`. Many items from that plan have already been completed. This plan reflects the **actual current state** of the codebase and focuses on the remaining high-value work.

---

## What's Already Done (remove from old plan)

- Jest configuration for both backend (Node) and frontend (jsdom)
- Test database setup with Docker Compose + GitHub Actions PostgreSQL service
- CI/CD pipeline (GitHub Actions: lint, type-check, test with coverage, build)
- Integration tests: kanban API, status API, teardown utilities
- Frontend tests: App component, KanbanBoard component
- Database-backed session storage with expiration/revocation
- Comprehensive security: Helmet, rate limiting, CSRF, SQL injection detection, bcrypt, input validation, audit logging
- TypeScript strict mode with working compilation
- Codecov integration with PR coverage comments

---

## Remaining Work (Priority Order)

### Phase 1: Fix Critical Issues (Immediate)

1. **Fix ESLint config - it ignores all TypeScript files**
   - File: `eslint.config.js` (29 lines)
   - Problem: `ignores` array excludes `**/*.ts` and `**/*.tsx` - so linting only covers legacy `.js` files
   - Fix: Add `@typescript-eslint` parser + plugin, remove TS from ignores
   - Impact: CI `npm run lint` step is currently meaningless

2. **Raise backend coverage thresholds**
   - File: `jest.config.js`
   - Current: all thresholds set to 0% (no enforcement)
   - Target: raise incrementally (start at 30%, work toward 60%+)
   - Current actual coverage: ~32% function coverage on `server/index.js`

3. **Clean up compiled JS alongside TS source files**
   - Server directory has both `.ts` source and `.js` compiled output in same folders
   - The `tsconfig.json` outputs to `./dist` but old `.js` files remain
   - Remove stale `.js` files from `server/` (keep only `.ts` sources + `dist/` output)
   - Update any imports/references that point to old `.js` paths

### Phase 2: Expand Test Coverage (Week 1-2)

4. **Add unit tests for server middleware**
   - `server/middleware/auth.ts` - session validation, input sanitization, CSRF
   - `server/middleware/security.ts` - rate limiting, SQL injection detection, XSS
   - These are well-isolated modules, good candidates for unit tests

5. **Add unit tests for database operations**
   - `server/config/database.ts` - connection pooling, table creation, cleanup tasks
   - Test pool management, error handling, initialization

6. **Expand API route test coverage**
   - Missing: auth routes (login/logout/me), message routes, activity routes
   - Existing: kanban and status only
   - Target: cover all endpoints in `server/index.ts`

7. **Expand frontend test coverage**
   - Current: only App.test.js and KanbanBoard.test.js
   - Add: Login.tsx, Dashboard.tsx component tests
   - Client threshold already set at 70% - need to actually meet it

### Phase 3: Code Quality (Week 2-3)

8. **Consolidate Sequelize models with raw SQL queries**
   - Models exist in `server/models/` (Sequelize ORM) but API routes use raw `pool.query()`
   - Pick one approach and be consistent (recommend: Sequelize for all CRUD)
   - This reduces duplication and improves maintainability

9. **Structured logging**
   - Currently uses `console.log` throughout
   - Add a lightweight logger (e.g., pino or winston) with log levels
   - Helps with debugging in production

10. **Error handling improvements**
    - Add Express error-handling middleware (centralized)
    - Replace scattered try/catch with consistent error responses

### Phase 4: Feature Enhancement (Week 3-4)

11. **Kanban board UI redesign**
    - 6 columns already exist in schema (backlog/todo/inprogress/review/done/waiting-for-neil)
    - `KanbanBoard.js` has drag-drop WIP - finish and polish
    - Convert `KanbanBoard.js` to TypeScript
    - Task filtering and search (partially started)

12. **Enhanced chat/messaging**
    - File attachments (schema has `attachments JSONB` column ready)
    - Message threading (schema has `thread_id` column ready)
    - Message search

### Phase 5: UX Polish (Week 5+)

13. **Dark/light theme toggle**
14. **Notification system**
15. **Mobile responsiveness**
16. **Loading states and error boundaries**

---

## Verification

After each phase:
- Run `npm test -- --coverage --runInBand --forceExit` and verify thresholds pass
- Run `npm run lint` and verify no errors
- Run `npm run type-check` and verify no errors
- Push to `windwurf_dev` and verify GitHub Actions CI passes
- For frontend: `cd client && npm test -- --coverage`

---

## Key Files

| File | Purpose |
|------|---------|
| `eslint.config.js` | ESLint flat config (needs TS support) |
| `jest.config.js` | Backend Jest config |
| `client/jest.config.js` | Frontend Jest config |
| `.github/workflows/ci.yml` | CI/CD pipeline |
| `server/index.ts` | Main server (496 lines, all routes) |
| `server/middleware/auth.ts` | Auth middleware (237 lines) |
| `server/middleware/security.ts` | Security middleware (257 lines) |
| `server/config/database.ts` | DB config/pool (262 lines) |
| `tests/integration/setup.js` | Test DB setup utilities |
