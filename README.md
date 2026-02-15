# Swissclaw Hub

A shared web interface for operators and assistants to communicate, collaborate, and track activities.

**Live:** https://your-instance.example.com

## Project Structure

```
server/
â”œâ”€â”€ index.ts                # Express + Socket.io server
â”œâ”€â”€ mcp-server.ts           # MCP server for AI agent access
â”œâ”€â”€ config/
â”‚   â”œâ”€â”€ database.ts         # PostgreSQL pool & health checks
â”‚   â””â”€â”€ swagger.ts          # OpenAPI/Swagger base config
â”œâ”€â”€ middleware/
â”‚   â”œâ”€â”€ auth.ts             # Session auth, CSRF, rate limiting
â”‚   â””â”€â”€ security.ts         # Helmet, XSS, audit logging
â”œâ”€â”€ routes/
â”‚   â””â”€â”€ auth.ts             # Enhanced login/logout/session routes
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ logger.ts           # Pino structured logging
â”‚   â””â”€â”€ errors.ts           # asyncHandler + error middleware
â””â”€â”€ types/
    â””â”€â”€ index.ts            # Shared server type definitions

config/
â””â”€â”€ database.js             # Sequelize CLI config (migrations)

database/
â”œâ”€â”€ migrations/             # Sequelize migrations (schema management)
â””â”€â”€ seeders/

client/src/
â”œâ”€â”€ App.tsx                 # Main app (socket.io, real-time)
â”œâ”€â”€ App.css
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ KanbanBoard.tsx     # Drag-and-drop kanban (@dnd-kit)
â”‚   â””â”€â”€ KanbanBoard.css
â”œâ”€â”€ types/
â”‚   â””â”€â”€ index.ts            # Frontend type definitions
â””â”€â”€ __tests__/
    â””â”€â”€ App.test.js

tests/
â”œâ”€â”€ unit/                   # Unit tests (mocked dependencies, no DB)
â”œâ”€â”€ api/                    # Contract tests (real server + DB)
â”œâ”€â”€ integration/            # Full flow tests (real server + DB)
â””â”€â”€ zzz-teardown.test.js    # Closes pg pool & socket.io
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
| **Hosting** | a cloud platform |

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
| `get_messages` | Get recent chat messages |
| `send_message` | Log a chat activity event (broadcasts via Socket.io) |
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

Auto-deploys from `master` branch to a cloud platform. See [docs/project-info.md](docs/project-info.md) for hosting details.

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
