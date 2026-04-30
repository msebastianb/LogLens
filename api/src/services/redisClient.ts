/**
 * Redis client singleton using ioredis.
 *
 * lazyConnect: true — connection made on first command, not at import.
 * maxRetriesPerRequest: 1 — fail fast; prevents health check hanging.
 *
 * Used by:
 *   - Health check route (ping)
 *   - Scrub cache service (Story 3.x) — get/set/del scrub_cache:{userId}:{sessionId}
 *
 * [Source: architecture.md#session-cache-redis-7, story-1.2 dev notes]
 */
import { Redis } from 'ioredis'
import { env } from '../config/env.js'

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  enableReadyCheck: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 2_000,
})
