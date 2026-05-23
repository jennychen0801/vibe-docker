import { Pool } from 'pg';

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgrespassword',
        database: process.env.DB_NAME || 'attendance',
        port: parseInt(process.env.DB_PORT || '5432'),
      }
);

export default pool;
