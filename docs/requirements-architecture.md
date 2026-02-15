# Architecture (Historical)

> This was the original architecture proposal. The project is now built.
> See the [README](../README.md) for the current tech stack.

## Chosen Architecture

Full-stack TypeScript (Option A from the original proposal):

- **Frontend:** React 18 + TypeScript + @dnd-kit
- **Backend:** Node.js + Express + TypeScript
- **Real-time:** Socket.io
- **Database:** PostgreSQL 15+ (pg driver, raw SQL)
- **Hosting:** Render (Pro plan, auto-deploy from master)
- **CI/CD:** GitHub Actions

## Data Model (Implemented)

### Users
`id` (UUID), `email`, `name`, `password_hash`, `role`, `created_at`, `updated_at`, `last_login`

### Messages
`id`, `sender`, `content`, `created_at`

### Activities
`id`, `type`, `description`, `metadata` (JSON), `created_at`

### Kanban Columns
`id`, `name`, `display_name`, `emoji`, `color`, `position`, `created_at`

### Kanban Tasks
`id`, `task_id` (string, e.g., "TASK-ABC123"), `column_id` (FK), `title`, `description`, `priority`, `assigned_to`, `tags` (JSON array), `attachment_count`, `comment_count`, `position`, `created_at`, `updated_at`

### Sessions
`id` (UUID), `user_id` (FK), `token`, `user_agent`, `ip_address`, `expires_at`, `created_at`, `last_accessed_at`, `revoked_at`

### Security Logs
`id` (UUID), `type`, `method`, `path`, `status_code`, `ip_address`, `user_agent`, `user_id`, `duration`, `metadata` (JSON), `created_at`

### Status
`id` (UUID), `status`, `current_task`, `last_updated`

### Model Usage
`id` (INTEGER), `input_tokens` (INTEGER), `output_tokens` (INTEGER), `model` (VARCHAR), `estimated_cost` (DECIMAL), `created_at` (TIMESTAMP)
