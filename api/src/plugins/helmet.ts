/**
 * Fastify helmet plugin — HTTP security headers.
 *
 * Sets Content-Security-Policy, X-Frame-Options, X-Content-Type-Options,
 * and Strict-Transport-Security on every response.
 *
 * Extracted from app.ts so it can be tested in isolation.
 * [Source: architecture.md#security-middleware, story-1.6]
 */
import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'

export default fp(async function helmetPlugin(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", ...(env.LLM_BASE_URL ? [env.LLM_BASE_URL] : [])],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    // Deny framing entirely (clickjacking protection)
    frameguard: { action: 'deny' },
    crossOriginEmbedderPolicy: false,
  })
})
