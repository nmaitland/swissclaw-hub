# Swissclaw Hub - Implementation Plan

## Context

Tracking implementation progress across all phases. The `.js` files in `server/` are the actual working code; `.ts` files are incomplete rewrites. Tests run against the `.js` files.

---

## Phase 1: Fix Critical Issues - DONE

- [x] **Fix ESLint config** - Rewrote `eslint.config.js` with `typescript-eslint`, downgraded ESLint 10 to 9
- [x] **Raise backend coverage thresholds** - Set to 25% branches, 30% functions/lines/statements
- [x] **Clean up stale files** - Removed `server/index-new.js`, excluded unused `server/models/` and `server/routes/` from coverage

## Phase 2: Expand Test Coverage - DONE

- [x] **Unit tests for middleware** - 24 tests for auth (generateToken, validateInput, CSRF), 20 for security (sanitizeQuery, xssProtection, securityErrorHandler)
- [x] **Unit tests for database** - 17 tests for `server/config/database.js` (getDatabaseConfig, checkDatabaseHealth, cleanup functions, initializeDatabase)
- [x] **Integration tests expanded** - Auth edge cases (13), kanban edge cases (14), messages extended (4), legacy tasks (2), plus existing auth/messages/activities/health/kanban/status tests
- [x] **Frontend tests** - App (10), KanbanBoard (18), Login (6), Dashboard (12) = 46 total
- [x] **CI/CD** - Codecov v4 with token, coverage comments on PRs

**Total: ~160 tests across backend + frontend, CI green**

---

## Phase 3: Code Quality - DONE

- [x] **Remove dead Sequelize models** - Deleted `server/models/` (6 files), rewrote `tests/integration/setup.js` to use raw SQL via pool
- [x] **Add structured logging with pino** - Created `server/lib/logger.js` (silent in test, pino-pretty in dev, JSON in prod). Replaced all 86 console calls across `server/index.js`, `server/config/database.js`, `server/middleware/auth.js`, `server/middleware/security.js`, `server/routes/auth.js`
- [x] **Centralized error handling** - Created `server/lib/errors.js` with `asyncHandler` wrapper and `errorHandler` middleware. Refactored all 10 async route handlers to use asyncHandler, removing try/catch boilerplate. Added `app.use(errorHandler)` after all routes

---

## Phase 4: Feature Enhancement - PLANNED

### Key Findings from Exploration

**KanbanBoard.js (395 lines):**
- No drag-and-drop - uses modal-based column selection for moving tasks
- No filtering/search
- CSS is well-done (530 lines, dark theme, responsive grid)
- No drag-drop library installed

**App.js (259 lines) vs App.tsx (312 lines):**
- App.js is the active version (socket.io, real-time updates)
- App.tsx is an unused TypeScript version with better structure
- No React Router - manual window.location redirects
- State is local useState only (no Context/Redux)

**TypeScript mix:**
- Dashboard.tsx and Login.tsx are TypeScript
- KanbanBoard.js and App.js are JavaScript
- Types defined in `client/src/types/index.ts`

### Tasks

11. **Convert KanbanBoard to TypeScript**
    - Rename `.js` to `.tsx`, add proper types
    - Use interfaces from `types/index.ts`

12. **Add task filtering and search**
    - Search bar with debounced text filtering
    - Filter by priority, assignee, tags
    - Persist filter state in URL params or localStorage

13. **Add drag-and-drop**
    - Install `@dnd-kit/core` + `@dnd-kit/sortable` (modern, lightweight)
    - Replace modal-based column move with drag between columns
    - Keep modal for detailed task editing

---

## Phase 5: UX Polish - PLANNED

14. Dark/light theme toggle
15. Notification system
16. Mobile responsiveness improvements
17. Loading states and error boundaries

---

## Key Files

| File | Purpose |
|------|---------|
| `server/index.js` | Main server (1129 lines, all routes, raw SQL) |
| `server/config/database.js` | DB config/pool (259 lines) |
| `server/middleware/auth.js` | Auth middleware (validateInput, generateToken, CSRF) |
| `server/middleware/security.js` | Security middleware (sanitizeQuery, XSS, error handler) |
| `jest.config.js` | Backend Jest config (25/30/30/30 thresholds) |
| `client/jest.config.js` | Frontend Jest config (30% thresholds) |
| `.github/workflows/ci.yml` | CI/CD pipeline with Codecov |
| `client/src/components/KanbanBoard.js` | Kanban UI (395 lines) |
| `client/src/App.js` | Main app (259 lines, socket.io) |
