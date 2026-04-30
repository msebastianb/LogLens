/**
 * Unit tests for POST /api/v1/scrub.
 *
 * Mocks: scrubService.
 * [Source: story-3.4, AC1, AC2, AC3, AC4]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import authPlugin from '../plugins/auth.js'
import { scrubRoute } from './scrub.js'

const { mockScrubText } = vi.hoisted(() => ({
  mockScrubText: vi.fn<() => Promise<{ redactedText: string; redactionSummary: [] }>>(),
}))

vi.mock('../services/scrubService.js', () => ({
  scrubText: mockScrubText,
  ScrubUnavailableError: class ScrubUnavailableError extends Error {
    constructor(msg?: string) {
      super(msg)
      this.name = 'ScrubUnavailableError'
    }
  },
  ScrubTimeoutError: class ScrubTimeoutError extends Error {
    constructor() {
      super('timeout')
      this.name = 'ScrubTimeoutError'
    }
  },
  ScrubValidationError: class ScrubValidationError extends Error {
    detail: unknown
    constructor(detail: unknown) {
      super('422')
      this.name = 'ScrubValidationError'
      this.detail = detail
    }
  },
}))

vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
    SESSION_TTL_SECONDS: 28800,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SCRUBBER_URL: 'http://scrubber-mock:8001',
    SCRUBBER_TIMEOUT_MS: 5000,
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
  await app.register(scrubRoute)
  return app
}

function makeAuthCookie(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const token = app.jwt.sign({ sub: '1', username: 'tester' })
  return `token=${token}`
}

const STUB_SCRUB = {
  redactedText: 'cleaned text',
  redactionSummary: [{ entity_type: 'SECRET', start: 0, end: 5, placeholder: '[REDACTED_SECRET]' }],
}

describe('POST /api/v1/scrub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated request', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'some text' }),
    })
    expect(res.statusCode).toBe(401)
  })

  it('scrubs text and returns redacted result', async () => {
    mockScrubText.mockResolvedValue(STUB_SCRUB)
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: {
        'content-type': 'application/json',
        cookie: makeAuthCookie(app),
      },
      payload: JSON.stringify({ text: 'some text' }),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.redacted_text).toBe('cleaned text')
    expect(body.redaction_summary).toHaveLength(1)
  })

  it('forwards custom_patterns to scrubText', async () => {
    mockScrubText.mockResolvedValue(STUB_SCRUB)
    const app = await buildTestApp()
    await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: {
        'content-type': 'application/json',
        cookie: makeAuthCookie(app),
      },
      payload: JSON.stringify({ text: 'PROJ-1234 failed', custom_patterns: ['PROJ-[0-9]+'] }),
    })
    expect(mockScrubText).toHaveBeenCalledWith('PROJ-1234 failed', { customPatterns: ['PROJ-[0-9]+'] })
  })

  it('omits custom_patterns from scrubText call when not provided', async () => {
    mockScrubText.mockResolvedValue(STUB_SCRUB)
    const app = await buildTestApp()
    await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: {
        'content-type': 'application/json',
        cookie: makeAuthCookie(app),
      },
      payload: JSON.stringify({ text: 'plain text' }),
    })
    expect(mockScrubText).toHaveBeenCalledWith('plain text', { customPatterns: undefined })
  })

  it('returns 422 when scrubber raises ScrubValidationError', async () => {
    const { ScrubValidationError } = await import('../services/scrubService.js')
    mockScrubText.mockRejectedValue(new ScrubValidationError({ detail: 'bad regex' }))
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: {
        'content-type': 'application/json',
        cookie: makeAuthCookie(app),
      },
      payload: JSON.stringify({ text: 'text', custom_patterns: ['['] }),
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().message).toMatch(/validation error/i)
  })

  it('returns 504 when scrubber times out', async () => {
    const { ScrubTimeoutError } = await import('../services/scrubService.js')
    mockScrubText.mockRejectedValue(new ScrubTimeoutError())
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: {
        'content-type': 'application/json',
        cookie: makeAuthCookie(app),
      },
      payload: JSON.stringify({ text: 'text' }),
    })
    expect(res.statusCode).toBe(504)
  })

  it('returns 502 when scrubber is unavailable', async () => {
    const { ScrubUnavailableError } = await import('../services/scrubService.js')
    mockScrubText.mockRejectedValue(new ScrubUnavailableError('Scrubber unreachable'))
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/scrub',
      headers: {
        'content-type': 'application/json',
        cookie: makeAuthCookie(app),
      },
      payload: JSON.stringify({ text: 'text' }),
    })
    expect(res.statusCode).toBe(502)
  })
})
