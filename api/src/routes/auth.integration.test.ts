/**
 * Integration tests for auth routes — requires real PostgreSQL + Redis.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
 *   cd api && npm run test:integration
 *
 * Tests:
 *   POST /api/v1/auth/login  — correct credentials → httpOnly cookie
 *   POST /api/v1/auth/login  — wrong password → 401 generic message
 *   POST /api/v1/auth/logout — clears cookie; deletes Redis scrub_cache keys
 *   GET  /api/v1/auth/me     — expired JWT → 401
 *
 * [Source: story-1.4, task 8]
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import authPlugin from '../plugins/auth.js'
import { authRoute } from './auth.js'
import { createAdminUser } from '../services/setupService.js'
import { runMigrations } from '../db/migrate.js'
import { users, systemSettings } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { redis } from '../services/redisClient.js'

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgres://loglens:changeme@localhost:5433/loglens'
const TEST_SECRET = process.env.JWT_SECRET ?? 'integration-test-secret-minimum-32-characters-long'

let pool: Pool
let db: ReturnType<typeof drizzle>
let app: ReturnType<typeof Fastify>

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL, max: 3, connectionTimeoutMillis: 5_000 })
  db = drizzle(pool)
  await runMigrations()

  // Clean slate
  await db.delete(users)
  await db.delete(systemSettings).where(eq(systemSettings.key, 'first_run_complete'))

  // Create admin user via setupService
  await createAdminUser('admin', 'integrationpassword123')

  // Build app
  app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, {
    secret: TEST_SECRET,
    cookie: { cookieName: 'token', signed: false },
  })
  await app.register(sensible)
  await app.register(authPlugin)
  await app.register(authRoute)
})

afterAll(async () => {
  await db.delete(users)
  await db.delete(systemSettings).where(eq(systemSettings.key, 'first_run_complete'))
  await app.close()
  await pool.end()
  // Close shared redis singleton
  redis.disconnect()
})

describe('POST /api/v1/auth/login integration', () => {
  it('returns 200 and sets httpOnly cookie on correct credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'integrationpassword123' },
    })

    expect(res.statusCode).toBe(200)
    const setCookie = res.headers['set-cookie'] as string
    expect(setCookie).toContain('token=')
    expect(setCookie).toContain('HttpOnly')
  })

  it('returns 401 with generic message on wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'wrongpassword' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().message).toBe('Invalid credentials')
    // Must not hint at which field was wrong
    expect(res.json().message).not.toMatch(/username|password/i)
  })

  it('returns 401 with generic message on non-existent username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'nobody', password: 'anypassword123' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().message).toBe('Invalid credentials')
  })
})

describe('POST /api/v1/auth/logout integration', () => {
  it('clears cookie and deletes Redis scrub_cache keys', async () => {
    // First login to get a valid token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'integrationpassword123' },
    })
    const tokenCookie = (loginRes.headers['set-cookie'] as string).split(';')[0]
    const token = tokenCookie.replace('token=', '')

    // Decode token to get userId
    const payload = app.jwt.decode<{ sub: string }>(token)!
    const userId = payload.sub

    // Plant a dummy scrub_cache key in Redis
    const cacheKey = `scrub_cache:${userId}:session1`
    await redis.set(cacheKey, 'dummy-scrubbed-data')

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: tokenCookie },
    })

    expect(logoutRes.statusCode).toBe(200)

    // Cookie should be cleared
    const setCookie = logoutRes.headers['set-cookie'] as string
    expect(setCookie).toContain('token=;')

    // Redis key should be gone
    const exists = await redis.exists(cacheKey)
    expect(exists).toBe(0)
  })
})

describe('GET /api/v1/auth/me integration', () => {
  it('returns 401 when JWT is expired', async () => {
    // Use a real but already-expired token (iat+exp both in the past)
    // @fastify/jwt / fast-jwt signs with 'expiresIn' as seconds when a number
    // Use '1s' and then a manually crafted token with exp in the past
    // Simplest: sign normally then tamper exp
    const validToken = app.jwt.sign({ sub: '99', username: 'test' }, { expiresIn: 3600 })
    // Tamper: replace payload exp with a past timestamp
    const [header, , sig] = validToken.split('.')
    const payload = { sub: '99', username: 'test', iat: 1000000, exp: 1000001 }
    const tamperedToken = `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `token=${tamperedToken}` },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns user object when JWT is valid', async () => {
    // Sign a token directly to avoid hitting rate limit
    const token = app.jwt.sign({ sub: '1', username: 'admin' }, { expiresIn: 3600 })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ username: 'admin' })
    expect(typeof res.json().id).toBe('number')
  })
})
