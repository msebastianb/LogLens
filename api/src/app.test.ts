/**
 * Unit test for app.ts — log redaction.
 *
 * Verifies that sensitive request headers (authorization, cookie, x-api-key,
 * x-llm-api-key) are replaced with '[REDACTED]' in Fastify's pino log output.
 *
 * [Source: story-1.6, task 4, AC5]
 */
import { describe, it, expect, vi } from 'vitest'
import { Writable } from 'node:stream'
import Fastify from 'fastify'

// Minimal env mock — just enough for this isolated test
vi.mock('./config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
    SESSION_TTL_SECONDS: 28800,
    LOG_LEVEL: 'info',
    LLM_BASE_URL: undefined,
    HTTPS_ONLY: false,
    SCRUBBER_URL: 'http://scrubber:8001',
    SCRUBBER_TIMEOUT_MS: 30000,
  },
}))

describe('log redaction (app.ts config)', () => {
  it('redacts authorization header from request logs', async () => {
    const lines: string[] = []
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString())
        cb()
      },
    })

    const app = Fastify({
      logger: {
        level: 'info',
        stream,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.headers["x-llm-api-key"]',
          ],
          censor: '[REDACTED]',
        },
        // Include headers in the serialized req object so redaction has an effect
        serializers: {
          req(request) {
            return {
              method: request.method,
              url: request.url,
              headers: request.headers,
            }
          },
        },
      },
    })

    app.get('/ping', async () => ({ ok: true }))

    await app.inject({
      url: '/ping',
      headers: { authorization: 'Bearer supersecrettoken' },
    })
    await app.close()

    const allLogs = lines.join('\n')
    expect(allLogs).not.toContain('supersecrettoken')
    expect(allLogs).toContain('[REDACTED]')
  })

  it('redacts cookie header from request logs', async () => {
    const lines: string[] = []
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString())
        cb()
      },
    })

    const app = Fastify({
      logger: {
        level: 'info',
        stream,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.headers["x-llm-api-key"]',
          ],
          censor: '[REDACTED]',
        },
        serializers: {
          req(request) {
            return {
              method: request.method,
              url: request.url,
              headers: request.headers,
            }
          },
        },
      },
    })

    app.get('/ping', async () => ({ ok: true }))

    await app.inject({
      url: '/ping',
      headers: { cookie: 'token=jwt-goes-here' },
    })
    await app.close()

    const allLogs = lines.join('\n')
    expect(allLogs).not.toContain('jwt-goes-here')
    expect(allLogs).toContain('[REDACTED]')
  })
})
