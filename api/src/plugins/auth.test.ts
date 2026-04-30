/**
 * Unit tests for auth plugin (plugins/auth.ts)
 *
 * Tests via a dummy protected route:
 *   - Valid JWT in cookie → 200 + request.user decorated
 *   - Missing cookie → 401
 *   - Tampered/invalid JWT → 401
 *
 * [Source: story-1.4, task 7]
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import authPlugin from './auth.js'

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

  // Protected route for testing
  app.get(
    '/protected',
    { preHandler: [app.authenticate] },
    async (req) => ({ id: req.user.id, username: req.user.username }),
  )

  return app
}

function makeToken(app: Awaited<ReturnType<typeof buildTestApp>>, payload: object = { sub: '1', username: 'admin' }) {
  return app.jwt.sign(payload, { expiresIn: 3600 })
}

describe('auth plugin', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    app = await buildTestApp()
  })

  afterEach(async () => {
    await app.close()
  })

  it('decorates request.user and returns 200 when JWT cookie is valid', async () => {
    const token = makeToken(app)

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: 1, username: 'admin' })
  })

  it('returns 401 when no cookie is present', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when JWT is tampered', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie: 'token=tampered.jwt.value' },
    })
    expect(res.statusCode).toBe(401)
  })
})
