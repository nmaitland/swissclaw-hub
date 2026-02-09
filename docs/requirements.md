# Dashboard Requirements

## Core Features

### For operator
- See SwissClaw's current activities and status
- Send messages/requests to SwissClaw
- Check on pending tasks for operator to action
- View project progress
- Access shared resources

### For SwissClaw
- Display current work and status
- Log activities and progress
- Flag items needing operator's attention
- Track operator's action items
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
- **Option 1: [Sequelize](https://sequelize.org/)** Ã¢â‚¬â€ Full ORM with migrations, operator's preference
- **Option 2: [Flyway](https://flywaydb.org/)** Ã¢â‚¬â€ Industry standard for Java/SQL migrations
- **Option 3: [Liquibase](https://www.liquibase.org/)** Ã¢â‚¬â€ XML/YAML-based, language agnostic
- **Option 4: [db-migrate](https://db-migrate.readthedocs.io/)** Ã¢â‚¬â€ Node.js native solution

**Recommendation:** **Sequelize** Ã¢â‚¬â€ fits the Node.js/PostgreSQL stack and provides both ORM + migrations. Store migrations in `migrations/` folder.

**Added to backlog:** Phase 3 or V3.7

## Operator Action Items
*(To be populated as we identify tasks)*
