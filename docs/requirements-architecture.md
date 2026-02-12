# Architecture (Historical)

> This was the original architecture proposal. The project is now built.
> See the [README](../README.md) for the current tech stack.

## Chosen Architecture

Full-stack TypeScript (Option A from the original proposal):

- **Frontend:** React 18 + TypeScript + @dnd-kit
- **Backend:** Node.js + Express + TypeScript
- **Real-time:** Socket.io
- **Database:** PostgreSQL 15+ (pg driver, raw SQL)
- **Hosting:** Render (free tier, auto-deploy from master)
- **CI/CD:** GitHub Actions

## Data Model (Implemented)

### Messages
`id`, `sender`, `content`, `timestamp`

### Activities
`id`, `type`, `description`, `metadata` (JSON), `created_at`

### Kanban Columns
`id`, `name`, `position`

### Kanban Tasks
`id`, `column_id` (FK), `title`, `description`, `priority`, `position`, `created_at`, `updated_at`

### Sessions
`token`, `user_id`, `user_agent`, `ip_address`, `created_at`, `expires_at`

### Security Logs
`id`, `event_type`, `user_id`, `ip_address`, `details`, `created_at`
