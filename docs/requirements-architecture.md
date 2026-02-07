# SwissClaw Hub - Requirements & Architecture

## Project Name
**Swissclaw Hub**

## Overview
A shared web interface for Neil and SwissClaw to communicate, collaborate, and track activities beyond WhatsApp/Telegram.

---

## Functional Requirements

### 1. Activity Dashboard (Home View)
**Priority: HIGH**

Display SwissClaw's current state:
- **Status indicator**: Working / Idle / In Meeting / Error State
- **Current task**: What's being worked on right now
- **Recent activity**: Last 5-10 actions with timestamps
- **Active cron jobs**: Which background tasks are running
- **System health**: Any alerts or issues

### 2. Interactive Chat Window
**Priority: HIGH**

Two-way text communication:
- Real-time messaging (WebSocket or polling)
- Message history (searchable, paginated)
- Support for markdown formatting
- File attachment capability (images, documents)
- Message threading/replies
- Typing indicators
- Read receipts

### 3. Task Management
**Priority: MEDIUM**

Neil's action items and requests:
- List of pending tasks for Neil
- Due dates and priorities
- Mark items complete
- Add new requests
- View completed tasks history

### 4. Project Tracking
**Priority: MEDIUM**

Shared project visibility:
- Kanban board view (read-only for Neil, editable by SwissClaw)
- Project status overview
- Milestone tracking
- Notes/ideas section

### 5. Quick Actions
**Priority: MEDIUM**

One-click operations:
- Trigger heartbeat check
- Run specific cron job
- View recent reports (job search, health, etc.)
- Access common resources

### 6. Notifications
**Priority: MEDIUM**

Alert system:
- Browser notifications for important messages
- Toast notifications for activity updates
- Notification preferences (what to alert on)

### 7. Admin/Settings
**Priority: LOW**

Configuration:
- Theme selection (light/dark)
- Notification preferences
- API key management (for integrations)
- User profile

---

## Non-Functional Requirements

### Performance
- **Page load**: < 2 seconds initial load
- **Time to interactive**: < 3 seconds
- **API response time**: < 500ms for most operations
- **Real-time latency**: < 1 second for chat messages
- **Concurrent users**: Support 2-5 simultaneous sessions (Neil + SwissClaw on multiple devices)

### Scalability
- Horizontal scaling capability if needed
- Stateless backend design
- Efficient database queries with indexing
- Caching strategy for read-heavy operations

### Reliability
- **Uptime target**: 99.5% (allowing for maintenance windows)
- Graceful error handling with user-friendly messages
- Automatic retry for failed operations
- Database backups (daily)

### Security
- **HTTPS only** (TLS 1.3)
- Authentication required (no public access)
- Session management with secure cookies
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS protection (output encoding)
- Rate limiting on API endpoints
- Secrets management (environment variables, not in code)

### Maintainability
- Clean, documented code
- Modular architecture
- Automated testing (unit + integration)
- CI/CD pipeline for deployments
- Structured logging
- Health check endpoints

### Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatible
- Responsive design (mobile + desktop)

### Device Support
- **Primary**: Laptop/desktop (Chrome, Firefox, Safari, Edge)
- **Secondary**: Mobile browsers (iOS Safari, Chrome Mobile)
- **Viewport**: 320px - 2560px width

### Hosting Considerations
- **Cost-conscious**: Target <$20/month initially
- **Geographic**: Europe-based (low latency for Zurich)
- **Compliance**: GDPR-ready (data in EU, right to deletion)

---

## Technical Architecture Proposal

### Option A: Full-Stack JavaScript (Recommended)

**Frontend:**
- React 18 + TypeScript
- Next.js 14 (App Router) for SSR/SSG
- Tailwind CSS for styling
- React Query for data fetching
- Socket.io-client for real-time chat
- Zustand or Redux for state management

**Backend:**
- Node.js 20 + Express or Fastify
- TypeScript
- Socket.io for WebSocket connections
- JWT-based authentication
- Rate limiting with express-rate-limit

**Database:**
- PostgreSQL 15+ (RDS or Cloud SQL)
- Redis for session storage & caching
- Sequelize or Prisma ORM

**Hosting:**
- **AWS**: ECS/Fargate + RDS + ElastiCache + CloudFront
- **GCP**: Cloud Run + Cloud SQL + Memorystore + Cloud CDN
- **Alternative**: Railway/Render/Fly.io for simplicity

**CI/CD:**
- GitHub Actions
- Automated testing on PR
- Staging → Production pipeline

### Option B: Serverless (Cost-Optimized)

**Frontend:**
- Same as Option A (Next.js)
- Deployed to Vercel or Netlify

**Backend:**
- Next.js API routes (serverless functions)
- Supabase (managed Postgres + realtime)
- Edge functions for WebSocket handling

**Pros:** Lower cost, less infra management
**Cons:** Less control, potential cold starts

---

## Data Model (Draft)

### Users
- id (UUID)
- email
- name
- role (admin/user)
- created_at

### Messages
- id (UUID)
- sender_id (FK)
- content (text)
- attachments (JSON)
- thread_id (nullable)
- created_at
- read_at

### Activities
- id (UUID)
- type (enum: cron, task, alert, etc.)
- description
- metadata (JSON)
- created_at

### Tasks
- id (UUID)
- title
- description
- status (pending/in_progress/done)
- priority (low/medium/high)
- assigned_to
- due_date
- created_at
- completed_at

---

## Open Questions for Confirmation

1. **Authentication**: Simple password login or OAuth (Google)?
2. **Real-time**: WebSocket (persistent connection) or SSE (server-sent events)?
3. **Hosting preference**: AWS vs GCP vs simpler platform (Railway/Render)?
4. **Budget**: Confirm <$20/month target is acceptable
5. **Domain**: ✅ **swissclaw.hydeabbey.net** (confirmed!)
6. **MVP scope**: Which features for v1.0? (Suggest: Activity + Chat only)

---

## Phase 1 (MVP) Proposal

Focus on the core need:
1. Activity dashboard (my current state)
2. Interactive chat window
3. Basic authentication
4. Mobile-responsive UI

**Timeline estimate**: 2-3 weeks part-time
**Cost estimate**: $10-15/month

---

*Ready for your review and architecture confirmation!*
