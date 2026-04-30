/**
 * Integration tests for setup routes — requires real PostgreSQL.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
 *   cd api && npm run test:integration
 *
 * Tests:
 *   GET  /api/v1/setup — returns firstRunComplete based on real DB state
 *   POST /api/v1/setup — valid data creates user + sets first_run_complete
 *   POST /api/v1/setup — short password returns 400, no row created
 *   POST /api/v1/setup — second call returns 409
 *
 * [Source: story-1.3, task 5]
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { setupRoute } from './setup.js'
import { users, systemSettings } from '../db/schema.js'
import { runMigrations } from '../db/migrate.js'

const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgres://loglens:changeme@localhost:5433/loglens'

let pool: Pool
let db: ReturnType<typeof drizzle>
let app: ReturnType<typeof Fastify>

async function cleanSetupData() {
  await db.delete(users)
  await db.delete(systemSettings).where(eq(systemSettings.key, 'first_run_complete'))
}

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL, max: 3, connectionTimeoutMillis: 5_000 })
  db = drizzle(pool)

  // Ensure schema is present
  await runMigrations()

  // Clean up any previous test data
  await cleanSetupData()

  app = Fastify({ logger: false })
  await app.register(sensible)
  await app.register(setupRoute)
})

afterAll(async () => {
  await cleanSetupData()
  await app.close()
  await pool.end()
})

describe('GET /api/v1/setup integration', () => {
  it('returns firstRunComplete: false on a fresh database', async () => {
    await cleanSetupData()
    const res = await app.inject({ method: 'GET', url: '/api/v1/setup' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ firstRunComplete: false })
  })
})

describe('POST /api/v1/setup integration', () => {
  beforeAll(async () => {
    await cleanSetupData()
  })

  it('creates admin user and sets first_run_complete on valid input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: { username: 'admin', password: 'integration-pass-123' },
    })

    expect(res.statusCode).toBe(200)

    // Verify user row was created
    const userRows = await db.select().from(users).where(eq(users.username, 'admin'))
    expect(userRows).toHaveLength(1)
    expect(userRows[0]?.passwordHash).not.toBe('integration-pass-123')
    expect(userRows[0]?.passwordHash.length).toBeGreaterThanOrEqual(60)

    // Verify system_settings row
    const settingRows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'first_run_complete'))
    expect(settingRows[0]?.value).toBe('true')
  })

  it('returns 400 and creates no rows when password is too short', async () => {
    await cleanSetupData()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: { username: 'admin', password: 'short' },
    })

    expect(res.statusCode).toBe(400)

    const userRows = await db.select().from(users)
    expect(userRows).toHaveLength(0)
  })

  it('returns 409 when setup has already been completed', async () => {
    await cleanSetupData()

    // First call — succeeds
    await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: { username: 'admin', password: 'integration-pass-123' },
    })

    // Second call — should conflict
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: { username: 'admin2', password: 'integration-pass-456' },
    })

    expect(res.statusCode).toBe(409)
  })
})
