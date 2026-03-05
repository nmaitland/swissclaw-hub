# Backlog

Features and ideas not yet implemented. See [README.md](../README.md) for what's already built.

## UX Polish (Phase 5)

- [ ] **Dark/light theme toggle** — persist preference in localStorage
- [ ] **Notification system** — browser notifications + toast messages for new chat, task updates
- [ ] **Mobile responsiveness improvements** — better touch targets, responsive chat panel
- [ ] **Loading states and error boundaries** — React error boundaries, skeleton loaders for chat/activity

## Chat Enhancements

- [ ] **File attachments in chat** — upload files, display inline (DB has `attachment_count` column ready)
- [ ] **Message search** — search/filter chat history

## Power User Features

- [ ] **Command palette** — VS Code style `Ctrl+K` command launcher (currently `Ctrl+K` is kanban search)
- [ ] **Data visualization** — charts for token usage trends, activity stats

## Technical Debt (Phase 7)

- [ ] **Migrate tests to TypeScript** — 19 test files + 2 config files still in `.js`:
  - `tests/unit/` (3 files), `tests/integration/` (13 files), `tests/api/` (1 file), `tests/zzz-teardown.test.js`, `tests/setup.js`
  - `client/src/__tests__/App.test.js`, `client/src/components/__tests__/KanbanBoard.test.js`
  - Config: `jest.config.js`, `eslint.config.js`

## Completed (for reference)

<details>
<summary>Phases 1-4 + extras (all done)</summary>

- Activity dashboard with real-time WebSocket updates
- Interactive chat with Socket.io
- Drag-and-drop kanban board (@dnd-kit) with search (`Ctrl+K`) and priority filtering
- 6 columns: Backlog, To Do, In Progress, Review, Done, Waiting for Neil
- Card detail modal with description and column move buttons
- Priority color-coded borders with glow effect, column progress bars
- Session-based authentication with bcrypt, CSRF protection
- Responsive card-based layout with mobile horizontal scroll
- PostgreSQL with raw SQL (pg driver) + Sequelize migrations for schema
- Structured logging (pino), centralized error handling
- CI/CD with GitHub Actions + Codecov
- API documentation with Swagger UI (`/api-docs`)
- MCP server for AI agent integration (13 tools)
- Chat bridge webhook + Hub API CLI scripts
- BetterStack monitoring integration
- Loading skeleton animations

</details>
