/**
 * Unit tests for auth routes (routes/auth.ts)
 *
 * Mocks: authService (verifyPassword), scrubCache (deleteAll)
 * Tests:
 *   POST /api/v1/auth/login — 200 + set-cookie on valid credentials
 *   POST /api/v1/auth/login — 401 on invalid credentials
 *   POST /api/v1/auth/logout — 200 + cookie cleared (authenticated)
 *   GET  /api/v1/auth/me    — 200 + user object
 *   GET  /api/v1/auth/me    — 401 when unauthenticated
 *
 * [Source: story-1.4, task 7]
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import authPlugin from '../plugins/auth.js'
import { authRoute } from './auth.js'

const { mockVerifyPassword, mockDeleteAll } = vi.hoisted(() => ({
  mockVerifyPassword: vi.fn<() => Promise<{ id: number; username: string } | null>>(),
  mockDeleteAll: vi.fn<() => Promise<void>>(),
}))

vi.mock('../services/authService.js', () => ({
  verifyPassword: mockVerifyPassword,
}))
vi.mock('../services/scrubCache.js', () => ({
  deleteAll: mockDeleteAll,
}))
vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
    SESSION_TTL_SECONDS: 28800,
    LOGIN_RATE_LIMIT_MAX: 5,
    BCRYPT_ROUNDS: 8,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  },
}))

const TEST_SECRET = 'test-jwt-secret-minimum-32-characters-long'

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, {
    secret: TEST_SECRET,
    cookie: { cookieName: 'token', signed: false },
  })
  await app.register(sensible)
  await app.register(authPlugin)
  await app.register(authRoute)
  return app
}

describe('auth routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await buildTestApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ─── POST /api/v1/auth/login ───────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('returns 200 and sets httpOnly cookie on valid credentials', async () => {
      mockVerifyPassword.mockResolvedValue({ id: 1, username: 'admin' })

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'admin', password: 'validpassword123' },
      })

      expect(res.statusCode).toBe(200)
      const setCookie = res.headers['set-cookie'] as string
      expect(setCookie).toBeDefined()
      expect(setCookie).toContain('token=')
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Strict')
    })

    it('returns 401 with generic message on invalid credentials', async () => {
      mockVerifyPassword.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'admin', password: 'wrongpassword' },
      })

      expect(res.statusCode).toBe(401)
      expect(res.json().message).toBe('Invalid credentials')
      // Ensure no username/password distinction in response
      expect(JSON.stringify(res.json())).not.toContain('username')
      expect(JSON.stringify(res.json())).not.toContain('password')
    })
  })

  // ─── POST /api/v1/auth/logout ─────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('returns 200 and clears cookie when authenticated', async () => {
      mockDeleteAll.mockResolvedValue(undefined)

      const token = app.jwt.sign({ sub: '1', username: 'admin' }, { expiresIn: 3600 })

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie: `token=${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(mockDeleteAll).toHaveBeenCalledWith(1)
      const setCookie = res.headers['set-cookie'] as string
      expect(setCookie).toContain('token=;')
    })

    it('returns 401 when not authenticated', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' })
      expect(res.statusCode).toBe(401)
    })
  })

  // ─── Rate limiter ─────────────────────────────────────────────────────────

  describe('rate limiter', () => {
    it('reads max from LOGIN_RATE_LIMIT_MAX env — 429 after limit exceeded', async () => {
      // Env mock sets LOGIN_RATE_LIMIT_MAX=5; hit login 6 times sequentially, last must be 429
      mockVerifyPassword.mockResolvedValue(null)

      const statuses: number[] = []
      for (let i = 0; i < 6; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { username: 'admin', password: 'wrong' },
        })
        statuses.push(res.statusCode)
      }

      // First 5 should be 401 (wrong creds), 6th should be 429
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true)
      expect(statuses[5]).toBe(429)
    })
  })

  // ─── GET /api/v1/auth/me ──────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('returns user object when authenticated', async () => {
      const token = app.jwt.sign({ sub: '1', username: 'admin' }, { expiresIn: 3600 })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie: `token=${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ id: 1, username: 'admin' })
    })

    it('returns 401 when not authenticated', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
      expect(res.statusCode).toBe(401)
    })
  })
})
