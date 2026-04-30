/**
 * Integration tests for Drizzle migrations — requires a real PostgreSQL instance.
 *
 * Prerequisites:
 *   docker compose up -d postgres
 *   DATABASE_URL=postgres://loglens:loglens@localhost:5433/loglens
 *
 * Tests:
 *   1. Migrations create all three tables on a fresh DB
 *   2. Re-running migrations is idempotent (no error)
 *
 * [Source: story-1.2 AC1, task 7]
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { runMigrations } from './migrate.js'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
  connectionTimeoutMillis: 5_000,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public'
       AND table_name = $1
     )`,
    [tableName],
  )
  return res.rows[0]?.exists ?? false
}

async function dropAllTables() {
  await pool.query(`
    DROP TABLE IF EXISTS data_sources CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS system_settings CASCADE;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
  `)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runMigrations integration', () => {
  beforeAll(async () => {
    // Start from a clean slate
    await dropAllTables()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('creates users table', async () => {
    await runMigrations()
    expect(await tableExists('users')).toBe(true)
  })

  it('creates system_settings table', async () => {
    expect(await tableExists('system_settings')).toBe(true)
  })

  it('creates data_sources table', async () => {
    expect(await tableExists('data_sources')).toBe(true)
  })

  it('is idempotent — re-running does not throw', async () => {
    // Run again against already-migrated DB
    await expect(runMigrations()).resolves.toBeUndefined()
  })
})
