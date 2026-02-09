# Dashboard Requirements

## Core Features

### For Neil
- See SwissClaw's current activities and status
- Send messages/requests to SwissClaw
- Check on pending tasks for Neil to action
- View project progress
- Access shared resources

### For SwissClaw
- Display current work and status
- Log activities and progress
- Flag items needing Neil's attention
- Track Neil's action items
- Show proactive suggestions

## Design Principles
- Clean, modern interface
- Mobile-responsive
- Fast load times
- Pleasant to use daily
- Clear visual hierarchy

## Open Questions
- [ ] What tech stack? (Next.js, Hugo, simple HTML?)
- [ ] Hosting? (S3, Vercel, self-hosted?)
- [ ] Real-time updates or periodic refresh?
- [ ] Authentication needed?

## Technical Debt / Future Improvements

### Database Schema Management
**Issue:** Current `initDb()` approach doesn't handle schema migrations well. When new columns are added, existing databases aren't automatically updated.

**Solution:** Implement proper database migration tool:
- **Option 1: [Sequelize](https://sequelize.org/)** — Full ORM with migrations, Neil's preference
- **Option 2: [Flyway](https://flywaydb.org/)** — Industry standard for Java/SQL migrations
- **Option 3: [Liquibase](https://www.liquibase.org/)** — XML/YAML-based, language agnostic
- **Option 4: [db-migrate](https://db-migrate.readthedocs.io/)** — Node.js native solution

**Recommendation:** **Sequelize** — fits the Node.js/PostgreSQL stack and provides both ORM + migrations. Store migrations in `migrations/` folder.

**Added to backlog:** Phase 3 or V3.7

## Neil's Action Items
*(To be populated as we identify tasks)*
