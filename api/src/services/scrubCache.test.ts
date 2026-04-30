/**
 * Unit tests for scrubCache — set, get, deleteAll.
 *
 * Mocks: redis (ioredis), env
 * [Source: story-3.1, task 4, AC2]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRedisSet, mockRedisGet, mockRedisScan, mockRedisDel } = vi.hoisted(() => ({
  mockRedisSet: vi.fn<() => Promise<string>>().mockResolvedValue('OK'),
  mockRedisGet: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
  mockRedisScan: vi.fn<() => Promise<[string, string[]]>>(),
  mockRedisDel: vi.fn<() => Promise<number>>().mockResolvedValue(1),
}))

vi.mock('../services/redisClient.js', () => ({
  redis: {
    set: mockRedisSet,
    get: mockRedisGet,
    scan: mockRedisScan,
    del: mockRedisDel,
  },
}))

vi.mock('../config/env.js', () => ({
  env: {
    SESSION_TTL_SECONDS: 28800,
    NODE_ENV: 'test',
  },
}))

const { set, get, del, deleteAll } = await import('./scrubCache.js')

describe('scrubCache', () => {
  beforeEach(() => {
    mockRedisSet.mockReset().mockResolvedValue('OK')
    mockRedisGet.mockReset().mockResolvedValue(null)
    mockRedisScan.mockReset()
    mockRedisDel.mockReset().mockResolvedValue(1)
  })

  describe('set()', () => {
    it('stores text in Redis with correct key and TTL', async () => {
      await set(42, 'cache-abc', 'scrubbed log content')

      expect(mockRedisSet).toHaveBeenCalledWith(
        'scrub_cache:42:cache-abc',
        'scrubbed log content',
        'EX',
        28800,
      )
    })
  })

  describe('get()', () => {
    it('returns the stored value for a known key', async () => {
      mockRedisGet.mockResolvedValue('scrubbed log content')
      const result = await get(42, 'cache-abc')
      expect(result).toBe('scrubbed log content')
      expect(mockRedisGet).toHaveBeenCalledWith('scrub_cache:42:cache-abc')
    })

    it('returns null for a missing key', async () => {
      mockRedisGet.mockResolvedValue(null)
      const result = await get(42, 'missing')
      expect(result).toBeNull()
    })
  })

  describe('deleteAll()', () => {
    it('scans and deletes all keys matching scrub_cache:{userId}:*', async () => {
      mockRedisScan
        .mockResolvedValueOnce(['0', ['scrub_cache:7:abc', 'scrub_cache:7:def']])

      await deleteAll(7)

      expect(mockRedisScan).toHaveBeenCalledWith('0', 'MATCH', 'scrub_cache:7:*', 'COUNT', 100)
      expect(mockRedisDel).toHaveBeenCalledWith('scrub_cache:7:abc', 'scrub_cache:7:def')
    })

    it('makes no DEL call when no keys match', async () => {
      mockRedisScan.mockResolvedValueOnce(['0', []])

      await deleteAll(99)

      expect(mockRedisDel).not.toHaveBeenCalled()
    })
  })

  describe('del()', () => {
    it('deletes the specific scrub-cache key for a user + cacheId', async () => {
      await del(42, 'cache-abc')
      expect(mockRedisDel).toHaveBeenCalledWith('scrub_cache:42:cache-abc')
    })
  })
})
