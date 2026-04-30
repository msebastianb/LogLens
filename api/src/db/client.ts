/**
 * Database client — pg.Pool + Drizzle singleton.
 *
 * Single pool instance reused across all requests.
 * Import `db` for Drizzle queries, `pool` for raw SQL (health check ping).
 *
 * [Source: architecture.md#data-architecture, story-1.2 dev notes]
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../config/env.js'
import * as schema from './schema.js'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
})

export const db = drizzle(pool, { schema })
