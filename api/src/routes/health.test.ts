/**
 * Unit tests for health check route (api/src/routes/health.ts).
 *
 * Uses Fastify inject() — no real network.
 * All three dependencies (pool, redis, scrubber fetch) are mocked.
 *
 * Test matrix:
 *   1. All checks pass → 200 ok
 *   2. DB fails        → 503 degraded, db: "error"
 *   3. Cache fails     → 503 degraded, cache: "error"
 *   4. Scrubber fails  → 503 degraded, scrubber: "error"
 *
 * [Source: story-1.2 AC3, AC4, task 6]
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import type { Pool } from 'pg'
import type Redis from 'ioredis'
import { healthRoute } from './health.js'

// ─── Mock factory helpers ─────────────────────────────────────────────────────

function makePool(ok: boolean): Pool {
  return {
    query: ok
      ? vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
      : vi.fn().mockRejectedValue(new Error('connection refused')),
  } as unknown as Pool
}

function makeRedis(ok: boolean): Redis {
  return {
    ping: ok
      ? vi.fn().mockResolvedValue('PONG')
      : vi.fn().mockRejectedValue(new Error('redis unavailable')),
  } as unknown as Redis
}

// ─── Global fetch mock ────────────────────────────────────────────────────────

function mockFetch(ok: boolean) {
  return vi.fn().mockResolvedValue({ ok })
}

// ─── Test helper — build minimal Fastify with health route ───────────────────

async function buildTestApp(opts: {
  poolOk: boolean
  redisOk: boolean
  scrubberOk: boolean
}) {
  const app = Fastify({ logger: false })
  const fetchSpy = mockFetch(opts.scrubberOk)
  vi.stubGlobal('fetch', fetchSpy)

  await app.register(healthRoute, {
    pool: makePool(opts.poolOk),
    redis: makeRedis(opts.redisOk),
    scrubberUrl: 'http://scrubber:8001',
  })

  return app
}

describe('GET /health', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 200 with status ok when all checks pass', async () => {
    const app = await buildTestApp({ poolOk: true, redisOk: true, scrubberOk: true })
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      status: 'ok',
      checks: { db: 'ok', cache: 'ok', scrubber: 'ok' },
    })
  })

  it('returns 503 with db: error when DB is unreachable', async () => {
    const app = await buildTestApp({ poolOk: false, redisOk: true, scrubberOk: true })
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({
      status: 'degraded',
      checks: { db: 'error', cache: 'ok', scrubber: 'ok' },
    })
  })

  it('returns 503 with cache: error when Redis is unreachable', async () => {
    const app = await buildTestApp({ poolOk: true, redisOk: false, scrubberOk: true })
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({
      status: 'degraded',
      checks: { db: 'ok', cache: 'error', scrubber: 'ok' },
    })
  })

  it('returns 503 with scrubber: error when scrubber is unreachable', async () => {
    const app = await buildTestApp({ poolOk: true, redisOk: true, scrubberOk: false })
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({
      status: 'degraded',
      checks: { db: 'ok', cache: 'ok', scrubber: 'error' },
    })
  })

  it('runs all checks concurrently — all three failures reported', async () => {
    const app = await buildTestApp({ poolOk: false, redisOk: false, scrubberOk: false })
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({
      status: 'degraded',
      checks: { db: 'error', cache: 'error', scrubber: 'error' },
    })
  })
})
