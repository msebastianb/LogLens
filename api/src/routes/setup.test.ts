/**
 * Unit tests for setup routes.
 *
 * Mocks: setupService (isFirstRunComplete, createAdminUser)
 * Tests:
 *   GET  /api/v1/setup — returns { firstRunComplete: false }
 *   POST /api/v1/setup — 400 on short password
 *   POST /api/v1/setup — 409 when already complete
 *   POST /api/v1/setup — 200 on valid first-time submission
 *
 * [Source: story-1.3, task 4]
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { setupRoute } from './setup.js'

// Declare mock fns via vi.hoisted so they are available when vi.mock is hoisted
const { mockIsFirstRunComplete, mockCreateAdminUser } = vi.hoisted(() => ({
  mockIsFirstRunComplete: vi.fn<() => Promise<boolean>>(),
  mockCreateAdminUser: vi.fn<() => Promise<void>>(),
}))

vi.mock('../services/setupService.js', () => ({
  isFirstRunComplete: mockIsFirstRunComplete,
  createAdminUser: mockCreateAdminUser,
}))

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  await app.register(setupRoute)
  return app
}

describe('setup routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await buildTestApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ─── GET /api/v1/setup ────────────────────────────────────────────────────

  describe('GET /api/v1/setup', () => {
    it('returns { firstRunComplete: false } when not configured', async () => {
      mockIsFirstRunComplete.mockResolvedValue(false)

      const res = await app.inject({ method: 'GET', url: '/api/v1/setup' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ firstRunComplete: false })
    })

    it('returns { firstRunComplete: true } when configured', async () => {
      mockIsFirstRunComplete.mockResolvedValue(true)

      const res = await app.inject({ method: 'GET', url: '/api/v1/setup' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ firstRunComplete: true })
    })
  })

  // ─── POST /api/v1/setup ───────────────────────────────────────────────────

  describe('POST /api/v1/setup', () => {
    it('returns 400 when password is shorter than 12 characters', async () => {
      mockIsFirstRunComplete.mockResolvedValue(false)

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/setup',
        payload: { username: 'admin', password: 'short' },
      })

      expect(res.statusCode).toBe(400)
      expect(mockCreateAdminUser).not.toHaveBeenCalled()
    })

    it('returns 400 when username is empty', async () => {
      mockIsFirstRunComplete.mockResolvedValue(false)

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/setup',
        payload: { username: '', password: 'validpassword123' },
      })

      expect(res.statusCode).toBe(400)
      expect(mockCreateAdminUser).not.toHaveBeenCalled()
    })

    it('returns 409 when setup is already complete', async () => {
      mockIsFirstRunComplete.mockResolvedValue(true)

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/setup',
        payload: { username: 'admin', password: 'validpassword123' },
      })

      expect(res.statusCode).toBe(409)
      expect(mockCreateAdminUser).not.toHaveBeenCalled()
    })

    it('returns 200 on first valid submission', async () => {
      mockIsFirstRunComplete.mockResolvedValue(false)
      mockCreateAdminUser.mockResolvedValue(undefined)

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/setup',
        payload: { username: 'admin', password: 'validpassword123' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockCreateAdminUser).toHaveBeenCalledWith('admin', 'validpassword123')
    })
  })
})
