import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import { env } from './config/env.js'
import helmetPlugin from './plugins/helmet.js'
import csrfPlugin from './plugins/csrf.js'
import { healthRoute } from './routes/health.js'
import { setupRoute } from './routes/setup.js'
import { authRoute } from './routes/auth.js'
import authPlugin from './plugins/auth.js'
import multipart from '@fastify/multipart'
import { logsRoute } from './routes/logs.js'
import { scrubRoute } from './routes/scrub.js'
import { analysisRoute } from './routes/analysis.js'
import { pool } from './db/client.js'
import { redis } from './services/redisClient.js'

/**
 * Builds and configures the Fastify application instance.
 * Registers all plugins and routes.
 * [Source: architecture.md#api-framework]
 */
export async function buildApp() {
  const app = Fastify({
    bodyLimit: 10 * 1024 * 1024, // 10 MB
    logger: {
      level: env.LOG_LEVEL,
      // Redact credentials from all log output
      // [Source: architecture.md#logging-structured-json]
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'req.headers["x-llm-api-key"]',
        ],
        censor: '[REDACTED]',
      },
    },
  })

  // ─── Security headers ──────────────────────────────────────────────
  // [Source: architecture.md#security-middleware]
  await app.register(helmetPlugin)

  // ─── CORS ──────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : false,
    credentials: true,
  })

  // ─── Cookie + JWT ──────────────────────────────────────────────────
  await app.register(cookie)
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  })

  // ─── RFC 7807 error responses ──────────────────────────────────────
  // [Source: architecture.md#api-design]
  await app.register(sensible)

  // ─── CSRF protection ───────────────────────────────────────────────
  // Must come after @fastify/cookie (uses cookies for _csrf secret).
  await app.register(csrfPlugin)

  // ─── Routes ───────────────────────────────────────────────────────
  await app.register(authPlugin)
  await app.register(healthRoute, {
    pool,
    redis,
    scrubberUrl: env.SCRUBBER_URL,
  })
  await app.register(setupRoute)
  await app.register(authRoute)

  // ─── File upload support ───────────────────────────────────────────
  // Must be registered before logsRoute so req.file() is available.
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
    },
  })
  await app.register(logsRoute)
  await app.register(scrubRoute)
  await app.register(analysisRoute)

  return app
}
