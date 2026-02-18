# Swissclaw Hub

A shared web interface for Neil and SwissClaw to communicate, collaborate, and track activities.

**Live:** https://swissclaw.hydeabbey.net

## Project Structure

```
server/
├── index.ts                # Express + Socket.io server
├── mcp-server.ts           # MCP server for AI agent access
├── config/
│   ├── database.ts         # PostgreSQL pool & health checks
│   └── swagger.ts          # OpenAPI/Swagger base config
├── middleware/
│   ├── auth.ts             # Session auth, CSRF, rate limiting
│   └── security.ts         # Helmet, XSS, audit logging
├── routes/
│   └── auth.ts             # Enhanced login/logout/session routes
├── lib/
│   ├── logger.ts           # Pino structured logging
│   └── errors.ts           # asyncHandler + error middleware
└── types/
    └── index.ts            # Shared server type definitions

config/
└── database.js             # Sequelize CLI config (migrations)

database/
├── migrations/             # Sequelize migrations (schema management)
└── seeders/

client/src/
├── App.tsx                 # Main app (socket.io, real-time)
├── App.css
├── components/
│   ├── KanbanBoard.tsx     # Drag-and-drop kanban (@dnd-kit)
│   └── KanbanBoard.css
├── types/
│   └── index.ts            # Frontend type definitions
└── __tests__/
    └── App.test.js

tests/
├── unit/                   # Unit tests (mocked dependencies, no DB)
├── api/                    # Contract tests (real server + DB)
├── integration/            # Full flow tests (real server + DB)
└── zzz-teardown.test.js    # Closes pg pool & socket.io
```

## Features

- Real-time status dashboard with WebSocket updates
- Interactive chat with Socket.io
- Drag-and-drop kanban board with search and priority filtering
- Activity feed with timestamps
- Session-based authentication with CSRF protection
- PostgreSQL database with raw SQL (no ORM at runtime)
- Database schema managed by Sequelize migrations
- Structured logging (pino)
- API documentation with Swagger UI at `/api-docs`
- MCP server for AI agent integration
- CI/CD with GitHub Actions and Codecov

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | React 18, TypeScript, @dnd-kit |
| **Backend** | Node.js, Express, TypeScript |
| **Real-time** | Socket.io |
| **Database** | PostgreSQL 15+ (pg driver, Sequelize migrations) |
| **Auth** | Session-based (bcrypt + secure cookies) |
| **Security** | Helmet, rate limiting, CORS, input validation |
| **API Docs** | Swagger UI (swagger-jsdoc + swagger-ui-express) |
| **AI Integration** | MCP server (@modelcontextprotocol/sdk) |
| **Testing** | Jest, ts-jest, supertest, React Testing Library |
| **CI/CD** | GitHub Actions, Codecov |
| **Hosting** | Render (Pro plan) |

## Database Setup

The project uses Sequelize migrations for database schema management.

### Initial Setup

1. Create the database:
```bash
# For development
npx sequelize-cli db:create

# For test
npx sequelize-cli db:create --env test
```

2. Run migrations:
```bash
# For development
npm run db:migrate

# For test
npm run db:migrate:test
```

3. (Optional) Seed test data:
```bash
# For development
npm run db:seed

# For test
npm run db:seed:test
```

### Reset Database

To completely reset the database (drop, create, migrate, seed):
```bash
# For development
npm run db:reset

# For test
npm run db:reset:test
```

## Local Development

1. Install dependencies:
```bash
npm run install-all
```

2. Set up environment:
```bash
cp .env.example .env
# Edit .env with your database URL and credentials
```

3. Set up the database (see Database Setup above)

4. Start development server:
```bash
npm run dev
```

This starts:
- Backend on http://localhost:3001 (via ts-node)
- Frontend on http://localhost:3000

## Testing

See [TESTING.md](TESTING.md) for the full testing guide.

Quick start:
```bash
# Start test database
docker-compose -f docker-compose.test.yml up -d test-db

# Run migrations on test database
npm run db:migrate:test

# Run all backend tests
npm run test:with-db

# Run client tests
npm run test:client

# Stop test database
docker-compose -f docker-compose.test.yml down
```

## API Documentation

Interactive Swagger UI is available at `/api-docs` when the server is running.

- **Swagger UI:** http://localhost:3001/api-docs
- **Raw OpenAPI spec:** http://localhost:3001/api-docs.json

## MCP Server

An MCP (Model Context Protocol) server is included for AI agent access to the Hub's API. It exposes tools for reading/writing chat messages, managing kanban tasks, updating status, and adding activity events.

**Available tools:**
| Tool | Description |
|------|-------------|
| `get_status` | Get server status, recent messages, and activities |
| `update_status` | Update the status panel (state and current task) |
| `get_messages` | Get recent chat messages |
| `send_message` | Log a chat activity event (broadcasts via Socket.io) |
| `update_message_state` | Update message processing state (shows UI indicators) |
| `get_kanban` | Get the full kanban board |
| `create_task` | Create a new kanban task |
| `update_task` | Update or move a kanban task |
| `delete_task` | Delete a kanban task |
| `add_activity` | Add an activity event |
| `get_activities` | Get paginated activity history |
| `report_model_usage` | Report AI model token usage and cost |
| `get_build_info` | Get build date and commit hash |

**Running the MCP server:**
```bash
npm run mcp
```

**Claude Code integration:** The `.mcp.json` file configures the MCP server for use with Claude Code. Set `SWISSCLAW_HUB_URL` and `SWISSCLAW_TOKEN` environment variables for the target Hub instance.

See [docs/mcp-server.md](docs/mcp-server.md) for full documentation.

## Agent Chat Bridge

A standalone script for connecting local AI agents to the Hub's chat via Socket.io (event-driven, works behind firewalls).

**Quick start:**
```bash
# Set credentials
set SWISSCLAW_USERNAME=admin
set SWISSCLAW_PASSWORD=yourpassword

# Interactive chat mode
npx ts-node scripts/agent-chat-bridge.ts

# Daemon mode (output messages as JSON lines)
npx ts-node scripts/agent-chat-bridge.ts --daemon

# Send a message
npx ts-node scripts/agent-chat-bridge.ts --send "Hello" --sender "MyBot"
```

**Environment variables:**
| Variable | Description |
|----------|-------------|
| `SWISSCLAW_USERNAME` | Hub login username |
| `SWISSCLAW_PASSWORD` | Hub login password |
| `SWISSCLAW_HUB_URL` | Hub URL (default: https://swissclaw.hydeabbey.net) |

The script saves the auth token to `~/.swissclaw-token` for reuse.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NODE_ENV` | `development` or `production` | Yes |
| `PORT` | Server port (default: 3001) | No |
| `CLIENT_URL` | Frontend URL for CORS | Production |
| `AUTH_USERNAME` | Login username (default: admin) | Yes |
| `AUTH_PASSWORD` | Login password | Yes |
| `SWISSCLAW_TOKEN` | Service-to-service auth token | Yes |
| `SWISSCLAW_AUTH_TOKEN` | Bearer token for MCP server (optional) | No |
| `REACT_APP_API_URL` | API URL for React client (empty = same-origin) | No |

## Deployment

Auto-deploys from `master` branch to Render (Pro plan). See [docs/project-info.md](docs/project-info.md) for hosting details.

The database schema is managed by Sequelize migrations. Migrations run automatically during deployment via the start command (`npm run db:migrate && npm run server`). For local development, run migrations manually:

```bash
npm run db:migrate
```

Build command:
```bash
npm install && cd client && npm install && npm run build && cd .. && npm run build
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start backend + frontend in dev mode |
| `npm run build` | Build server (tsc) + client (react-scripts) |
| `npm start` | Run migrations + start production server |
| `npm test` | Run backend tests |
| `npm run test:with-db` | Run backend tests with local Docker DB |
| `npm run test:unit` | Run unit tests only (mocked, no DB required) |
| `npm run test:integration` | Run integration tests only |
| `npm run test:client` | Run React tests |
| `npm run lint` | ESLint server code |
| `npm run type-check` | TypeScript type checking |
| `npm run mcp` | Start MCP server (stdio transport) |
| `npm run db:migrate` | Run Sequelize migrations (production) |
| `npm run db:migrate:test` | Run Sequelize migrations (test) |
| `npm run db:seed` | Run Sequelize seeders (production) |
| `npm run db:seed:test` | Run Sequelize seeders (test) |
| `npm run db:reset` | Drop, create, migrate, seed (development) |
| `npm run db:reset:test` | Drop, create, migrate, seed (test) |
