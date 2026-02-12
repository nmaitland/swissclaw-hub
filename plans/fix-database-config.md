# Fix: Database Configuration for Render Deployment

## Problem

The deployment to Render fails with error: `column "task_id" does not exist`

This happens because:
1. Render provides `DATABASE_URL` as a connection string (e.g., `postgres://user:pass@host:5432/dbname`)
2. The `config/database.js` file used by Sequelize CLI only looks for individual `DB_*` environment variables
3. The production configuration doesn't parse `DATABASE_URL`
4. Migrations fail silently during deployment, leaving the database schema incomplete

## Root Cause

In `config/database.js`, the production configuration:
```javascript
production: {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: false
}
```

This doesn't handle `DATABASE_URL`, so when Render sets only `DATABASE_URL`, the connection fails.

## Solution

Update `config/database.js` to:
1. Parse `DATABASE_URL` if present
2. Use parsed values as fallback for individual variables
3. Add SSL configuration for Render's managed PostgreSQL

## Implementation

Replace the production configuration with:

```javascript
// Helper function to parse DATABASE_URL
const parseDatabaseUrl = (url) => {
  if (!url) return null;
  
  try {
    const parsed = new URL(url);
    return {
      username: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1),
      host: parsed.hostname,
      port: parseInt(parsed.port || '5432', 10),
    };
  } catch (error) {
    console.error('Failed to parse DATABASE_URL:', error.message);
    return null;
  }
};

// Parse DATABASE_URL if present
const dbUrlConfig = process.env.DATABASE_URL ? parseDatabaseUrl(process.env.DATABASE_URL) : null;

// In the exports:
production: {
  username: dbUrlConfig?.username || process.env.DB_USER,
  password: dbUrlConfig?.password || process.env.DB_PASSWORD,
  database: dbUrlConfig?.database || process.env.DB_NAME,
  host: dbUrlConfig?.host || process.env.DB_HOST,
  port: dbUrlConfig?.port || process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: process.env.DATABASE_URL ? {
      require: true,
      rejectUnauthorized: false
    } : false
  }
}
```

## Verification Steps

1. After deployment, check Render logs for migration success
2. Verify the kanban board loads without errors
3. Confirm `task_id` column exists in `kanban_tasks` table
