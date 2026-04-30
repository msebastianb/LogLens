/**
 * Unit tests for csrfPlugin — verifies token endpoint, enforcement, and exemptions.
 *
 * To exercise CSRF enforcement in the test environment (NODE_ENV=test by default),
 * env is mocked with NODE_ENV='production' so the onRequest hook activates.
 *
 * [Source: story-1.6, task 4, AC2, AC3, AC4]
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import csrfPlugin from './csrf.js'

// Force CSRF enforcement (production mode) for all tests in this file
vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
    SESSION_TTL_SECONDS: 28800,
    NODE_ENV: 'production',
    HTTPS_ONLY: false,
    LOG_LEVEL: 'silent',
    LLM_BASE_URL: undefined,
  },
}))

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, {
    secret: 'test-jwt-secret-minimum-32-characters-long',
    cookie: { cookieName: 'token', signed: false },
  })
  await app.register(sensible)
  await app.register(csrfPlugin)

  // Protected test route
  app.post('/test', async () => ({ ok: true }))

  // Stub exempt routes (mirrors real route patterns)
  app.post('/api/v1/auth/login', async () => ({ ok: true }))
  app.post('/api/v1/setup', async () => ({ ok: true }))

  return app
}

describe('csrfPlugin', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    app = await buildTestApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ─── Token endpoint ───────────────────────────────────────────────

  describe('GET /api/v1/csrf/token', () => {
    it('returns 200 with { token } and sets _csrf cookie', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/csrf/token' })

      expect(res.statusCode).toBe(200)
      const body = res.json() as { token: string }
      expect(typeof body.token).toBe('string')
      expect(body.token.length).toBeGreaterThan(0)

      const setCookie = res.headers['set-cookie'] as string
      expect(setCookie).toContain('_csrf=')
    })
  })

  // ─── Enforcement ─────────────────────────────────────────────────

  describe('CSRF enforcement', () => {
    it('rejects POST to protected route without CSRF token → 403', async () => {
      const res = await app.inject({ method: 'POST', url: '/test', payload: {} })
      expect(res.statusCode).toBe(403)
    })

    it('allows POST to protected route with valid x-csrf-token → 200', async () => {
      // Get token + cookie
      const tokenRes = await app.inject({ method: 'GET', url: '/api/v1/csrf/token' })
      const { token } = tokenRes.json() as { token: string }
      const csrfCookie = (tokenRes.headers['set-cookie'] as string).split(';')[0]

      const res = await app.inject({
        method: 'POST',
        url: '/test',
        headers: {
          'x-csrf-token': token,
          cookie: csrfCookie,
        },
        payload: {},
      })
      expect(res.statusCode).toBe(200)
    })
  })

  // ─── Exemptions ───────────────────────────────────────────────────

  describe('CSRF exemptions', () => {
    it('allows POST /api/v1/auth/login without CSRF token (pre-auth exempt)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {},
      })
      // Should reach the handler (200), not be blocked by CSRF (403)
      expect(res.statusCode).toBe(200)
    })

    it('allows POST /api/v1/setup without CSRF token (pre-auth exempt)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/setup',
        payload: {},
      })
      expect(res.statusCode).toBe(200)
    })
  })
})
