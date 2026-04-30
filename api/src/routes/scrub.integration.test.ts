/**
 * Integration tests for POST /api/v1/scrub.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
 *   cd api && npm run test:integration
 *
 * A lightweight Fastify mock scrubber runs on 127.0.0.1:8099. Integration tests
 * run sequentially (singleFork: true); logs tests close their 8099 mock in afterAll
 * before this suite starts. SCRUBBER_URL is set to http://127.0.0.1:8099 globally
 * by vitest.integration.config.ts — no per-suite override needed.
 *
 * Tests:
 *   - unauthenticated request returns 401
 *   - valid custom_patterns: text matching pattern is replaced with [REDACTED_CUSTOM]
 *   - invalid regex in custom_patterns: scrubber returns 422, Fastify returns 422
 *
 * [Source: story-3.4, AC1, AC2, AC3, AC4]
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import authPlugin from '../plugins/auth.js'
import { scrubRoute } from './scrub.js'

const TEST_SECRET =
  process.env.JWT_SECRET ?? 'integration-test-secret-minimum-32-characters-long'

let app: ReturnType<typeof Fastify>
let mockScrubber: ReturnType<typeof Fastify>

async function startMockScrubber() {
  mockScrubber = Fastify({ logger: false })

  // Real-ish scrub handler: applies custom_patterns manually so we can test end-to-end
  mockScrubber.post('/scrub', async (req, reply) => {
    const body = req.body as { text: string; custom_patterns?: string[] }
    let text = body.text
    const redaction_summary: Array<{ entity_type: string; start: number; end: number; placeholder: string }> = []

    if (body.custom_patterns?.length) {
      for (const pattern of body.custom_patterns) {
        let compiled: RegExp
        try {
          compiled = new RegExp(pattern, 'g')
        } catch {
          // Return FastAPI-style 422 for invalid regex
          return reply.status(422).send({
            detail: [
              {
                type: 'value_error',
                loc: ['body', 'custom_patterns'],
                msg: `Value error, Invalid regex pattern ${JSON.stringify(pattern)}`,
                input: body.custom_patterns,
              },
            ],
          })
        }
        text = text.replace(compiled, (match, offset) => {
          redaction_summary.push({
            entity_type: 'CUSTOM',
            start: offset,
            end: offset + match.length,
            placeholder: '[REDACTED_CUSTOM]',
          })
          return '[REDACTED_CUSTOM]'
        })
      }
    }

    return { redacted_text: text, redaction_summary }
  })

  await mockScrubber.listen({ port: 8099, host: '127.0.0.1' })
}

beforeAll(async () => {
  await startMockScrubber()

  app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, {
    secret: TEST_SECRET,
    cookie: { cookieName: 'token', signed: false },
  })
  await app.register(sensible)
  await app.register(authPlugin)
  await app.register(scrubRoute)
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await mockScrubber.close()
})

function makeAuthCookie() {
  return `token=${app.jwt.sign({ sub: '1', username: 'admin' })}`
}

describe('POST /api/v1/scrub integration', () => {
  it('returns 401 without authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'some text' }),
    })
    expect(res.statusCode).toBe(401)
  })

  it('scrubs text with valid custom_patterns and returns [REDACTED_CUSTOM]', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: {
        'content-type': 'application/json',
        cookie: makeAuthCookie(),
      },
      payload: JSON.stringify({
        text: 'task PROJ-1234 failed',
        custom_patterns: ['PROJ-[0-9]+'],
      }),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.redacted_text).toContain('[REDACTED_CUSTOM]')
    expect(body.redacted_text).not.toContain('PROJ-1234')
    expect(body.redaction_summary).toHaveLength(1)
    expect(body.redaction_summary[0].entity_type).toBe('CUSTOM')
  })

  it('returns 422 for invalid regex in custom_patterns', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: {
        'content-type': 'application/json',
        cookie: makeAuthCookie(),
      },
      payload: JSON.stringify({
        text: 'some log line',
        custom_patterns: ['['],
      }),
    })

    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.message).toMatch(/validation error/i)
  })
})
