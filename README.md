# Swissclaw Hub - Source Code

## Project Structure

```
src/
â”œâ”€â”€ server/           # Node.js backend
â”‚   â””â”€â”€ index.js     # Express + Socket.io server
â”œâ”€â”€ client/          # React frontend
â”‚   â”œâ”€â”€ public/      # Static files
â”‚   â””â”€â”€ src/         # React components
â”‚       â”œâ”€â”€ App.js
â”‚       â”œâ”€â”€ App.css
â”‚       â””â”€â”€ index.js
â”œâ”€â”€ package.json     # Root package.json
â””â”€â”€ .env.example     # Environment variables template
```

## Features (V1)

- âœ… Real-time status dashboard
- âœ… WebSocket-based chat
- âœ… Activity logging
- âœ… PostgreSQL database
- âœ… Responsive design

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
- Backend on http://localhost:3001
- Frontend on http://localhost:3000

## Deployment to Render

### Option 1: Blueprint (Recommended)

1. Push code to GitHub
2. In Render dashboard: New > Blueprint Instance
3. Select your repository
4. Render automatically creates:
   - Web service
   - PostgreSQL database
   - Environment variables

### Option 2: Manual

1. Create PostgreSQL database in Render
2. Create Web Service:
   - Root directory: `dashboard/src`
   - Build command: `npm install && cd client && npm install && npm run build`
   - Start command: `npm start`
3. Add environment variables from database

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NODE_ENV` | `development` or `production` | Yes |
| `PORT` | Server port (default: 3001) | No |
| `CLIENT_URL` | Frontend URL for CORS | Production |

## Next Steps (V2)

- [ ] Kanban board view
- [ ] operator's action items list
- [ ] File attachments in chat
- [ ] Message search
- [ ] Dark/light theme toggle
