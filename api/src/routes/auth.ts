/**
 * Auth routes — username/password login, logout, and identity check.
 *
 * POST /api/v1/auth/login  — issues httpOnly JWT cookie on valid credentials
 * POST /api/v1/auth/logout — clears cookie + deletes Redis scrub-cache keys
 * GET  /api/v1/auth/me     — returns current user from JWT (used by SPA route guard)
 *
 * Login endpoint is rate-limited to 5 requests/minute per IP.
 * All responses use RFC 7807 error format via @fastify/sensible.
 *
 * [Source: architecture.md#authentication-security, story-1.4]
 */
import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import { env } from '../config/env.js'
import { verifyPassword } from '../services/authService.js'
import { deleteAll } from '../services/scrubCache.js'

const loginBodySchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

export async function authRoute(app: FastifyInstance): Promise<void> {
  // Rate-limit only the login endpoint — 5 requests/minute per IP
  await app.register(async (loginApp) => {
    await loginApp.register(rateLimit, {
      max: env.LOGIN_RATE_LIMIT_MAX,
      timeWindow: '1 minute',
      keyGenerator: (req) => req.ip,
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many login attempts. Please try again later.',
      }),
    })

    // ─── POST /api/v1/auth/login ────────────────────────────────────
    loginApp.post('/api/v1/auth/login', async (req, reply) => {
      const parsed = loginBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.unauthorized('Invalid credentials')
      }

      const { username, password } = parsed.data
      const user = await verifyPassword(username, password)

      if (!user) {
        return reply.unauthorized('Invalid credentials')
      }

      const token = app.jwt.sign(
        { sub: String(user.id), username: user.username },
        { expiresIn: env.SESSION_TTL_SECONDS },
      )

      reply.setCookie('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: env.SESSION_TTL_SECONDS,
      })

      return reply.code(200).send({ message: 'Logged in' })
    })
  })

  // ─── POST /api/v1/auth/logout ─────────────────────────────────────
  app.post(
    '/api/v1/auth/logout',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await deleteAll(req.user.id)
      reply.clearCookie('token', { path: '/' })
      return reply.code(200).send({ message: 'Logged out' })
    },
  )

  // ─── GET /api/v1/auth/me ──────────────────────────────────────────
  app.get(
    '/api/v1/auth/me',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      return reply.send({ id: req.user.id, username: req.user.username })
    },
  )
}
