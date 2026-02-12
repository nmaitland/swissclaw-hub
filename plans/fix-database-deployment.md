# Database Deployment Fix Plan

## Problem Analysis
The deployment to Render is failing because database tables are not being created. The root causes identified:

1. **Migrations run during build phase** - `npm run db:migrate` in render.yaml may fail if DATABASE_URL isn't available during build
2. **No database initialization on server startup** - Server doesn't ensure tables exist before starting
3. **Two database pool configurations** - Confusion between `server/index.ts` pool and `server/config/database.ts` pool
4. **No fallback mechanism** - Server crashes with "relation does not exist" errors if migrations fail

## Solution: Pre-start Migration Check

### Implementation Steps

1. **Create migration runner** (`server/lib/migrate.ts`)
   - Use `sequelize-cli` programmatically via child process
   - Add proper error handling and logging
   - Check if essential tables exist before running migrations

2. **Update server startup** (`server/index.ts`)
   - Import and call migration runner before `httpServer.listen()`
   - Add retry logic for database connectivity
   - Log migration status

3. **Ensure DATABASE_URL availability**
   - Verify DATABASE_URL is set in production environment
   - Update config/database.js to properly parse DATABASE_URL

4. **Update render.yaml** (optional)
   - Consider moving migrations from build phase to start command
   - Or keep both: build-time migrations for speed, startup migrations as fallback

### Code Changes Required

#### 1. Create `server/lib/migrate.ts`
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from './logger';

const execAsync = promisify(exec);

export async function runMigrations(): Promise<void> {
  const env = process.env.NODE_ENV || 'development';
  logger.info({ env }, 'Running database migrations...');
  
  try {
    const command = `npx sequelize-cli db:migrate`;
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, NODE_ENV: env },
      cwd: process.cwd(),
    });
    
    if (stdout) logger.debug({ stdout: stdout.trim() }, 'Migration output');
    if (stderr && !stderr.includes('warning')) {
      logger.warn({ stderr: stderr.trim() }, 'Migration warnings');
    }
    
    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to run database migrations');
    throw error;
  }
}

export async function checkTablesExist(pool: any): Promise<boolean> {
  const essentialTables = ['messages', 'activities', 'kanban_columns', 'kanban_tasks'];
  
  try {
    for (const table of essentialTables) {
      await pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
    }
    return true;
  } catch (error) {
    logger.debug({ err: error }, `Table check failed for one of: ${essentialTables.join(', ')}`);
    return false;
  }
}

export async function ensureMigrations(pool: any): Promise<void> {
  const tablesExist = await checkTablesExist(pool);
  
  if (!tablesExist) {
    logger.warn('Essential tables missing, running migrations...');
    await runMigrations();
    
    const tablesExistAfter = await checkTablesExist(pool);
    if (!tablesExistAfter) {
      throw new Error('Migrations ran but tables still missing');
    }
    logger.info('Migrations completed and tables verified');
  } else {
    logger.debug('All essential tables exist, skipping migrations');
  }
}
```

#### 2. Update `server/index.ts`
- Import `ensureMigrations` from `./lib/migrate`
- Call `await ensureMigrations(pool)` before `httpServer.listen()`
- Add try-catch with appropriate error handling

#### 3. Update `package.json` scripts
- Add `prestart` script to run migrations (optional)
- Ensure `sequelize-cli` is available as dependency

### Testing Strategy
1. Test locally with `npm run dev`
2. Simulate missing tables by dropping them
3. Verify migrations run automatically
4. Test production configuration with DATABASE_URL

### Deployment Considerations
- Render build phase may still run migrations (keep `npm run db:migrate` in buildCommand)
- Startup migration check acts as safety net
- If migrations fail at startup, server should exit with error code

### Alternative Approach
Instead of programmatic migrations, we could:
1. Move migrations to start command: `npm run db:migrate && npm start`
2. Use a startup script that checks and runs migrations
3. Use database connection pooling with retry logic

### Recommended Approach
Implement the migration runner with table checks as it provides:
- Safety net if build-time migrations fail
- Automatic recovery on restart
- Clear logging for debugging