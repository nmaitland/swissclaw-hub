# Swissclaw Hub - Project Information

## Overview
A shared web interface for operators and assistants to communicate and collaborate.

## Hosting

Hosted on a cloud platform with auto-deploy from `master` branch. Configuration managed via the hosting provider's dashboard.

### Build & Start
- **Build command:** `npm install && cd client && npm install && npm run build && cd .. && npm run build`
- **Start command:** `npm start`

## Architecture

| Component | Technology |
|-----------|------------|
| **Frontend** | React 18, TypeScript, @dnd-kit |
| **Backend** | Node.js + Express, TypeScript |
| **Real-time** | Socket.io (WebSocket) |
| **Database** | PostgreSQL 15+ (pg driver, raw SQL) |
| **Auth** | Session-based (bcrypt + secure cookies) |
| **Security** | Helmet, rate limiting, CORS, input validation |
| **Logging** | Pino (structured JSON) |
| **Testing** | Jest, ts-jest, supertest, React Testing Library |
| **CI/CD** | GitHub Actions, Codecov |

## Environment

### Required env vars
```
DATABASE_URL=postgresql://...
AUTH_USERNAME=<your_username>
AUTH_PASSWORD=<your_secure_password>
```

See `.env.example` for the full list.

## Versions

| Version | Date | Notes |
|---------|------|-------|
| V4.2 | 2026-02-15 | UI enhancements: Activities panel with pagination, status panel with model usage breakdown, auto-scroll fix, build date versioning, crab favicon |
| V4.1 | 2026-02-14 | Sequelize migrations, task ordering with sparse positioning, enhanced auth middleware |
| V4 | 2026-02-12 | Full TypeScript migration, drag-and-drop kanban, @dnd-kit |
| V3.4 | 2026-02-07 | Docs added, repo restructured |
| V3.3 | 2026-02-07 | Activity feed + chat panels |
| V3 | 2026-02-06 | Database-backed kanban API |
| V2 | 2026-02-05 | Kanban view + tasks |
| V1 | 2026-02-04 | React app + chat |

## Credentials

All credentials stored securely in the hosting provider's dashboard or a password manager. Never committed to the repository.

## Monitoring

- **Health endpoint:** `/health`
- **Build info:** `/api/build`
- **Status:** `/api/status` (requires auth)
