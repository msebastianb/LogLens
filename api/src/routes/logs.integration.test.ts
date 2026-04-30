/**
 * Integration tests for POST /api/v1/logs/upload.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
 *   cd api && npm run test:integration
 *
 * A lightweight Fastify mock scrubber runs on 127.0.0.1:8099 to simulate
 * the real scrubber service without requiring the Python container.
 * SCRUBBER_URL is set to http://127.0.0.1:8099 in vitest.integration.config.ts.
 *
 * Tests:
 *   - unauthenticated request returns 401
 *   - .log upload: scrubbed, cacheId returned, Redis key exists
 *   - .ndjson upload: scrubbed, cacheId returned
 *   - malformed .json returns 422 (no scrubber call)
 *   - unsupported extension returns 415
 *   - scrubber unreachable returns 502
 *
 * [Source: story-2.4, story-3.1, task 5, AC1, AC2, AC3]
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import multipart from '@fastify/multipart'
import { Pool } from 'pg'
import authPlugin from '../plugins/auth.js'
import { logsRoute } from './logs.js'
import { runMigrations } from '../db/migrate.js'
import { redis } from '../services/redisClient.js'

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgres://loglens:changeme@localhost:5433/loglens'
const TEST_SECRET = process.env.JWT_SECRET ?? 'integration-test-secret-minimum-32-characters-long'
const BOUNDARY = '----IntegrationBoundary5678'

let pool: Pool
let app: ReturnType<typeof Fastify>
let mockScrubber: ReturnType<typeof Fastify>

function buildMultipartBody(filename: string, content: string): Buffer {
  const body = [
    `--${BOUNDARY}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    'Content-Type: application/octet-stream',
    '',
    content,
    `--${BOUNDARY}--`,
    '',
  ].join('\r\n')
  return Buffer.from(body)
}

async function startMockScrubber() {
  mockScrubber = Fastify({ logger: false })
  mockScrubber.post('/scrub', async (req) => {
    const body = req.body as { text: string }
    return { redacted_text: body.text, redaction_summary: [] }
  })
  await mockScrubber.listen({ port: 8099, host: '127.0.0.1' })
}

beforeAll(async () => {
  await startMockScrubber()

  pool = new Pool({ connectionString: TEST_DB_URL, max: 3, connectionTimeoutMillis: 5_000 })
  await runMigrations()

  app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, {
    secret: TEST_SECRET,
    cookie: { cookieName: 'token', signed: false },
  })
  await app.register(sensible)
  await app.register(authPlugin)
  await app.register(multipart)
  await app.register(logsRoute)
})

afterAll(async () => {
  await app.close()
  await mockScrubber.close()
  await pool.end()
  redis.disconnect()
})

function makeAuthCookie() {
  return `token=${app.jwt.sign({ sub: '1', username: 'admin' })}`
}

describe('POST /api/v1/logs/upload integration', () => {
  it('returns 401 without authentication', async () => {
    const body = buildMultipartBody('test.log', 'line1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: body,
    })
    expect(res.statusCode).toBe(401)
  })

  it('parses a .log file, scrubs it, and returns cacheId + lineCount + Redis key', async () => {
    const logContent = 'INFO server started\nWARN high memory\nERROR connection reset'
    const body = buildMultipartBody('server.log', logContent)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: makeAuthCookie(),
      },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json() as { cacheId: string; lineCount: number; redactionSummary: [] }
    expect(typeof data.cacheId).toBe('string')
    expect(data.cacheId.length).toBeGreaterThan(0)
    expect(data.lineCount).toBe(3)
    expect(Array.isArray(data.redactionSummary)).toBe(true)

    // Verify Redis key was created (raw text must NOT be stored; only scrubbed)
    const cached = await redis.get(`scrub_cache:1:${data.cacheId}`)
    expect(cached).not.toBeNull()
  })

  it('parses a .ndjson file, scrubs it, and returns cacheId', async () => {
    const ndjsonContent = '{"level":"info","msg":"started"}\n{"level":"warn","msg":"slow"}\n'
    const body = buildMultipartBody('events.ndjson', ndjsonContent)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: makeAuthCookie(),
      },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json() as { cacheId: string; lineCount: number }
    expect(typeof data.cacheId).toBe('string')
    expect(data.lineCount).toBe(2)
  })

  it('returns 422 for malformed .json (not an array)', async () => {
    const body = buildMultipartBody('output.json', '{"not":"an array"}')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: makeAuthCookie(),
      },
      payload: body,
    })

    expect(res.statusCode).toBe(422)
    const data = res.json() as { message: string }
    expect(data.message).toMatch(/array/i)
  })

  it('returns 415 for unsupported file extension', async () => {
    const body = buildMultipartBody('data.csv', 'col1,col2')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: makeAuthCookie(),
      },
      payload: body,
    })

    expect(res.statusCode).toBe(415)
  })

  it('returns 502 when scrubber is unreachable', async () => {
    // Temporarily close mock scrubber to make port 8099 unreachable
    await mockScrubber.close()

    const body = buildMultipartBody('server.log', 'some log line')
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: makeAuthCookie(),
      },
      payload: body,
    })

    expect(res.statusCode).toBe(502)

    // Restart mock scrubber for subsequent tests
    await startMockScrubber()
  })
})
