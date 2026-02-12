require('dotenv').config();

// Helper function to parse DATABASE_URL
const parseDatabaseUrl = (url) => {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return {
      username: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1), // Remove leading slash
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

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'swissclaw_hub',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: console.log
  },
  test: {
    username: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'password',
    database: process.env.TEST_DB_NAME || 'swissclaw_hub_test',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: process.env.TEST_DB_PORT || 5433,
    dialect: 'postgres',
    logging: false
  },
  production: {
    // Use DATABASE_URL if available, otherwise fall back to individual variables
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
};
