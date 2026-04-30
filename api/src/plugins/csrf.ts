/**
 * Fastify CSRF protection plugin.
 *
 * - Registers @fastify/csrf-protection (cookie-backed, no session plugin needed)
 * - Exposes GET /api/v1/csrf/token — returns { token } and sets _csrf cookie
 * - Adds onRequest hook that enforces csrfProtection for state-mutating methods
 *   (POST, PUT, PATCH, DELETE) on non-exempt routes, but ONLY when
 *   NODE_ENV === 'production' or HTTPS_ONLY === true.
 *
 * Exempt routes (pre-auth — CSRF token cannot yet exist):
 *   POST /api/v1/auth/login
 *   POST /api/v1/setup
 *
 * Wrapped with fp() so reply.generateCsrf() and fastify.csrfProtection are
 * visible in the parent Fastify scope.
 *
 * [Source: architecture.md#security-middleware, story-1.6]
 */
import fp from 'fastify-plugin'
import csrf from '@fastify/csrf-protection'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'

const CSRF_EXEMPT_PATTERNS = new Set([
  '/api/v1/auth/login',
  '/api/v1/setup',
])

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default fp(async function csrfPlugin(app: FastifyInstance): Promise<void> {
  // @fastify/cookie must be registered before this plugin.
  // Cookie mode is the default when @fastify/cookie is present.
  await app.register(csrf)

  // ─── CSRF token endpoint ───────────────────────────────────────────
  app.get('/api/v1/csrf/token', async (_req, reply) => {
    const token = await reply.generateCsrf()
    return { token }
  })

  // ─── Conditional enforcement hook ─────────────────────────────────
  // Only enforced in production or when HTTPS_ONLY is explicitly set.
  // In development/test, CSRF is bypassed to preserve DX and test isolation.
  app.addHook('onRequest', (req, reply, done) => {
    if (env.NODE_ENV !== 'production' && !env.HTTPS_ONLY) return done()

    if (!STATE_CHANGING_METHODS.has(req.method)) return done()

    const routePattern = (req.routeOptions as { url?: string })?.url ?? req.url
    if (CSRF_EXEMPT_PATTERNS.has(routePattern)) return done()

    return app.csrfProtection(req, reply, done)
  })
})
