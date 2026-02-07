# Swissclaw Hub - Project Information

## Overview
A shared web interface for Neil and SwissClaw to communicate and collaborate.

## Hosting

| Detail | Value |
|--------|-------|
| **Platform** | Render (Free Tier) |
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
| **Frontend** | React 18 |
| **Backend** | Node.js + Express |
| **Real-time** | Socket.io (WebSocket) |
| **Database** | PostgreSQL (Render free tier) |
| **Auth** | Session-based (in-memory) |
| **Security** | Helmet, rate limiting, CORS |

## Environment

### Required env vars
```
DATABASE_URL=postgresql://...
AUTH_USERNAME=admin
AUTH_PASSWORD=<set_secure_password>
REACT_APP_API_URL=  # empty for same-origin
```

## Versions

| Version | Date | Notes |
|---------|------|-------|
| V3.4 | 2026-02-07 | Docs added, repo restructured |
| V3.3 | 2026-02-07 | Activity feed + chat panels |
| V3 | 2026-02-06 | Database-backed kanban API |
| V2 | 2026-02-05 | Kanban view + tasks |
| V1 | 2026-02-04 | React app + chat |

## Credentials

- **Database:** Stored in Render dashboard (auto-managed)
- **Auth:** Session-based, cleared on restart
- **API Key:** In 1Password (render-project-api-token)

## Monitoring

- **Health endpoint:** `/health`
- **Build info:** `/api/build`
- **Status:** `/api/status` (requires auth)

## Known Issues

See `docs/requirements-kanban-redesign.md` for proposed improvements.
