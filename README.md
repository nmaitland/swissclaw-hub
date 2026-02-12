# Swissclaw Hub

A shared web interface for Neil and SwissClaw to communicate, collaborate, and track activities.

**Live:** https://swissclaw.hydeabbey.net

## Project Structure

```
server/
├── index.ts                # Express + Socket.io server
├── config/
│   └── database.ts         # PostgreSQL pool & schema (initDb)
├── middleware/
│   ├── auth.ts             # Session auth, CSRF, rate limiting
│   └── security.ts         # Helmet, XSS, audit logging
├── routes/
│   └── auth.ts             # Login/logout/session routes
├── lib/
│   ├── logger.ts           # Pino structured logging
│   └── errors.ts           # asyncHandler + error middleware
└── types/
    └── index.ts            # Shared server type definitions

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
├── unit/                   # Unit tests (mocked DB)
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
- Structured logging (pino)
- CI/CD with GitHub Actions and Codecov

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | React 18, TypeScript, @dnd-kit |
| **Backend** | Node.js, Express, TypeScript |
| **Real-time** | Socket.io |
| **Database** | PostgreSQL 15+ (pg driver) |
| **Auth** | Session-based (bcrypt + secure cookies) |
| **Security** | Helmet, rate limiting, CORS, input validation |
| **Testing** | Jest, ts-jest, supertest, React Testing Library |
| **CI/CD** | GitHub Actions, Codecov |
| **Hosting** | Render (free tier) |

## Local Development

1. Install dependencies:
```bash
npm run install-all
```

2. Set up environment:
```bash
cp .env.example .env
# Edit .env with your database URL
```

3. Start development server:
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

# Run all backend tests
npm run test:with-db

# Run client tests
npm run test:client

# Stop test database
docker-compose -f docker-compose.test.yml down
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NODE_ENV` | `development` or `production` | Yes |
| `PORT` | Server port (default: 3001) | No |
| `CLIENT_URL` | Frontend URL for CORS | Production |
| `AUTH_USERNAME` | Login username | Yes |
| `AUTH_PASSWORD` | Login password (bcrypt hashed) | Yes |

## Deployment

Auto-deploys from `master` branch to Render. See [docs/project-info.md](docs/project-info.md) for hosting details.

Build command:
```bash
npm install && cd client && npm install && npm run build && cd .. && npm run build
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start backend + frontend in dev mode |
| `npm run build` | Build server (tsc) + client (react-scripts) |
| `npm start` | Start production server |
| `npm test` | Run backend tests |
| `npm run test:with-db` | Run backend tests with local Docker DB |
| `npm run test:client` | Run React tests |
| `npm run lint` | ESLint server code |
| `npm run type-check` | TypeScript type checking |
