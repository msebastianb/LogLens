/**
 * Health check route — full implementation (Story 1.2).
 *
 * Checks PostgreSQL, Redis, and scrubber reachability independently.
 * Each check has a 2-second timeout; failures are isolated.
 *
 * Response shape (AC3/AC4):
 *   200 { status: "ok",       checks: { db: "ok",    cache: "ok",    scrubber: "ok" } }
 *   503 { status: "degraded", checks: { db: "error", cache: "ok",    scrubber: "ok" } }
 *
 * Dependencies injected via Fastify plugin options for testability.
 * [Source: architecture.md#health-checks-fr34, story-1.2 dev notes]
 */
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type { Redis } from 'ioredis'

type CheckStatus = 'ok' | 'error'

interface HealthChecks {
  db: CheckStatus
  cache: CheckStatus
  scrubber: CheckStatus
}

interface HealthResponse {
  status: 'ok' | 'degraded'
  checks: HealthChecks
}

export interface HealthRouteOptions {
  pool: Pool
  redis: Redis
  scrubberUrl: string
}

async function checkDb(pool: Pool): Promise<CheckStatus> {
  try {
    await pool.query('SELECT 1')
    return 'ok'
  } catch {
    return 'error'
  }
}

async function checkCache(redis: Redis): Promise<CheckStatus> {
  try {
    const result = await redis.ping()
    return result === 'PONG' ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

async function checkScrubber(scrubberUrl: string): Promise<CheckStatus> {
  try {
    const res = await fetch(`${scrubberUrl}/health`, {
      signal: AbortSignal.timeout(2_000),
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export async function healthRoute(
  app: FastifyInstance,
  opts: HealthRouteOptions,
): Promise<void> {
  app.get('/health', async (_request, reply): Promise<HealthResponse> => {
    // Run all checks concurrently — do NOT short-circuit on first failure
    const [db, cache, scrubber] = await Promise.all([
      checkDb(opts.pool),
      checkCache(opts.redis),
      checkScrubber(opts.scrubberUrl),
    ])

    const checks: HealthChecks = { db, cache, scrubber }
    const allOk = db === 'ok' && cache === 'ok' && scrubber === 'ok'

    reply.code(allOk ? 200 : 503)
    return {
      status: allOk ? 'ok' : 'degraded',
      checks,
    }
  })
}

