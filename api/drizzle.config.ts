/**
 * drizzle-kit configuration for generating and running migrations.
 *
 * CLI usage:
 *   npm run db:generate   — generates SQL from schema.ts changes
 *   npm run db:migrate    — applies pending migrations to live DB
 *   npm run db:studio     — opens Drizzle Studio
 *
 * drizzle-kit 0.30.x uses `dialect: 'postgresql'` (not `driver: 'pg'`).
 * [Source: story-1.2 dev notes#drizzle-config]
 */
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
