# Swissclaw Hub - Project Information

## Overview
A shared web interface for Neil and SwissClaw to communicate and collaborate.

## Hosting

| Detail | Value |
|--------|-------|
| **Platform** | Render (Pro plan) |
| **Web Service** | swissclaw-hub |
| **Service ID** | `srv-d62u5te8alac738oo72g` |
| **Region** | Oregon (US West) |
| **URL** | https://swissclaw-hub.onrender.com/ |
| **Custom Domain** | https://swissclaw.hydeabbey.net |
| **GitHub Repo** | https://github.com/nmaitland/swissclaw-hub |
| **Render Dashboard** | https://dashboard.render.com/web/srv-d62u5te8alac738oo72g |

## Deployment

### Auto-deploy
- **Enabled:** Yes
- **Trigger:** Git commits to `master` branch
- **Build command:** `npm install && cd client && npm install && npm run build && cd .. && npm run build`
- **Start command:** `npm start`

### Manual deploy
```bash
# Force re-deploy via Render API
curl -X POST \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/srv-d62u5te8alac738oo72g/deploys
```

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
| **Monitoring** | BetterStack (see betterstack.md) |

## Environment

### Required env vars
```
DATABASE_URL=postgresql://...
AUTH_USERNAME=admin
AUTH_PASSWORD=<set_secure_password>
SWISSCLAW_TOKEN=<set_secure_service_token>
REACT_APP_API_URL=  # empty for same-origin
```

## Versions

| Version | Date | Notes |
|---------|------|-------|
| V4.1 | 2026-02-14 | Sequelize migrations, task ordering with sparse positioning, enhanced auth middleware |
| V4 | 2026-02-12 | Full TypeScript migration, drag-and-drop kanban, @dnd-kit |
| V3.4 | 2026-02-07 | Docs added, repo restructured |
| V3.3 | 2026-02-07 | Activity feed + chat panels |
| V3 | 2026-02-06 | Database-backed kanban API |
| V2 | 2026-02-05 | Kanban view + tasks |
| V1 | 2026-02-04 | React app + chat |

## Credentials

- **Database:** Stored in Render dashboard (auto-managed)
- **Auth:** Session-based, cleared on restart
- **API Key:** In 1Password (render-project-api-token)
- **BetterStack:** In 1Password (betterstack clickhouse api)

## Monitoring

- **Health endpoint:** `/health`
- **Build info:** `/api/build`
- **Status:** `/api/status` (requires auth)
- **BetterStack:** See [betterstack.md](betterstack.md)
