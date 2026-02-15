# Requirements (Historical)

> These requirements were defined before the project was built (Feb 2026).
> All core features have been implemented. This file is kept for reference.

## Implemented Features

- **Activity Dashboard** — Real-time status, current task, recent activity
- **Interactive Chat** — WebSocket messaging via Socket.io
- **Task Management** — Full kanban board with drag-and-drop (@dnd-kit)
- **Project Tracking** — Kanban columns: Backlog, To Do, In Progress, Review, Done, Waiting for Neil
- **Authentication** — Session-based login with bcrypt, CSRF protection
- **Responsive Design** — Mobile-friendly, card-based layout
- **Database Migrations** — Sequelize migrations for schema management

## Decisions Made

| Question | Decision |
|----------|----------|
| Tech stack | React 18 + Express + TypeScript |
| Hosting | Render (Pro plan) |
| Real-time | WebSocket via Socket.io |
| Authentication | Session-based (bcrypt) |
| Database | PostgreSQL with raw SQL (pg driver) + Sequelize migrations |
| Domain | swissclaw.hydeabbey.net |

## Remaining Backlog

- Dark/light theme toggle
- Notification system
- File attachments in chat
- Message search
