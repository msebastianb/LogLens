/**
 * Scrub cache service — manages Redis scrub_cache:{userId}:{cacheId} keys.
 *
 * Key scheme: scrub_cache:{userId}:{cacheId}
 * TTL: SESSION_TTL_SECONDS
 *
 * deleteAll: uses SCAN+DEL — never blocking redis.keys().
 *
 * [Source: architecture.md#session-cache-redis-7, story-1.4, story-3.1]
 */
import { redis } from './redisClient.js'
import { env } from '../config/env.js'

/**
 * Store scrubbed log text for a given user + cache ID.
 * TTL is set to SESSION_TTL_SECONDS so the cache expires with the session.
 */
export async function set(userId: number, cacheId: string, text: string): Promise<void> {
  const key = `scrub_cache:${userId}:${cacheId}`
  await redis.set(key, text, 'EX', env.SESSION_TTL_SECONDS)
}

/**
 * Retrieve previously cached scrubbed text.
 * Returns null if the key does not exist or has expired.
 */
export async function get(userId: number, cacheId: string): Promise<string | null> {
  return redis.get(`scrub_cache:${userId}:${cacheId}`)
}

/**
 * Delete a single scrub-cache entry by user + cache ID.
 * Used when a job is cancelled to free the cached scrubbed text.
 */
export async function del(userId: number, cacheId: string): Promise<void> {
  await redis.del(`scrub_cache:${userId}:${cacheId}`)
}

export async function deleteAll(userId: number): Promise<void> {
  const pattern = `scrub_cache:${userId}:*`
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) await redis.del(...(keys as [string, ...string[]]))
  } while (cursor !== '0')
}
