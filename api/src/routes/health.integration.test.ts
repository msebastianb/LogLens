/**
 * Integration tests for GET /health — requires real PostgreSQL + Redis + scrubber.
 *
 * Prerequisites:
 *   docker compose up -d postgres redis scrubber
 *   DATABASE_URL=postgres://loglens:loglens@localhost:5433/loglens
 *   REDIS_URL=redis://localhost:6379
 *
 * Tests:
 *   1. Returns 200 with all checks "ok" when all services are up
 *   2. Returns 503 with db: "error" when DATABASE_URL points to non-existent host
 *
 * [Source: story-1.2 AC3, AC4, task 7]
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { healthRoute } from './health.js'
import { buildApp } from '../app.js'

// ─── Happy path app — uses real services ─────────────────────────────────────

async function buildRealApp() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 3,
    connectionTimeoutMillis: 5_000,
  })
  const redis = new Redis(process.env.REDIS_URL!, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  })
  const app = Fastify({ logger: false })
  await app.register(healthRoute, {
    pool,
    redis,
    scrubberUrl: process.env.SCRUBBER_URL ?? 'http://localhost:8001',
  })
  return { app, pool, redis }
}

// ─── Broken-db app — DATABASE_URL points nowhere ─────────────────────────────

async function buildBrokenDbApp() {
  const pool = new Pool({
    connectionString: 'postgres://nobody:x@192.0.2.1:5432/nonexistent',
    connectionTimeoutMillis: 1_000,
    max: 1,
  })
  const redis = new Redis(process.env.REDIS_URL!, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  })
  const app = Fastify({ logger: false })
  await app.register(healthRoute, {
    pool,
    redis,
    scrubberUrl: process.env.SCRUBBER_URL ?? 'http://localhost:8001',
  })
  return { app, pool, redis }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /health integration', () => {
  describe('all services up', () => {
    let ctx: Awaited<ReturnType<typeof buildRealApp>>

    beforeAll(async () => {
      ctx = await buildRealApp()
    })

    afterAll(async () => {
      await ctx.app.close()
      await ctx.redis.quit()
      await ctx.pool.end()
    })

    it('returns 200 with all checks ok', async () => {
      const res = await ctx.app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({
        status: 'ok',
        checks: { db: 'ok', cache: 'ok', scrubber: 'ok' },
      })
    })
  })

  describe('database unreachable', () => {
    let ctx: Awaited<ReturnType<typeof buildBrokenDbApp>>

    beforeAll(async () => {
      ctx = await buildBrokenDbApp()
    })

    afterAll(async () => {
      await ctx.app.close()
      await ctx.redis.quit()
      await ctx.pool.end()
    })

    it('returns 503 with db: error', async () => {
      const res = await ctx.app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(503)
      const body = res.json()
      expect(body.status).toBe('degraded')
      expect(body.checks.db).toBe('error')
    })
  })
})

// ─── Security headers integration (story-1.6, AC1) ───────────────────────────

describe('security headers integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /health response includes Content-Security-Policy header', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['content-security-policy']).toBeDefined()
    expect(res.headers['content-security-policy']).toContain("default-src 'self'")
  })

  it('GET /health response includes X-Frame-Options: DENY', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['x-frame-options']).toBe('DENY')
  })

  it('GET /health response includes X-Content-Type-Options: nosniff', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })
})
