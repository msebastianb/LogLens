/**
 * Unit tests for POST /api/v1/logs/upload.
 *
 * Uses Fastify inject with a manually constructed multipart body.
 * Mocks: logFileParser (parseLogFile), scrubService, scrubCache, env.
 * [Source: story-2.4, story-3.1, task 4, AC1–AC4]
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import authPlugin from '../plugins/auth.js'
import { logsRoute } from './logs.js'

const { mockParseLogFile, mockScrubText, mockCacheSet } = vi.hoisted(() => ({
  mockParseLogFile: vi.fn<(filename: string, content: string) => string[]>(),
  mockScrubText: vi.fn<() => Promise<{ redactedText: string; redactionSummary: [] }>>(),
  mockCacheSet: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}))

vi.mock('../services/logFileParser.js', () => ({
  parseLogFile: mockParseLogFile,
  ParseError: class ParseError extends Error {
    lineNumber?: number
    constructor(message: string, lineNumber?: number) {
      super(message)
      this.name = 'ParseError'
      this.lineNumber = lineNumber
    }
  },
}))

vi.mock('../services/scrubService.js', () => ({
  scrubText: mockScrubText,
  ScrubUnavailableError: class ScrubUnavailableError extends Error {
    constructor(msg?: string) { super(msg); this.name = 'ScrubUnavailableError' }
  },
  ScrubTimeoutError: class ScrubTimeoutError extends Error {
    constructor() { super('timeout'); this.name = 'ScrubTimeoutError' }
  },
}))

vi.mock('../services/scrubCache.js', () => ({
  set: mockCacheSet,
  get: vi.fn(),
  deleteAll: vi.fn(),
}))

vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
    SESSION_TTL_SECONDS: 28800,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    MAX_LOG_SIZE_MB: 10,
    SCRUBBER_URL: 'http://scrubber-mock:8001',
    SCRUBBER_TIMEOUT_MS: 5000,
  },
}))

const TEST_SECRET = 'test-jwt-secret-minimum-32-characters-long'
const BOUNDARY = '----TestBoundary1234'

const STUB_SCRUB = { redactedText: 'line one\nline two', redactionSummary: [] }

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

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, {
    secret: TEST_SECRET,
    cookie: { cookieName: 'token', signed: false },
  })
  await app.register(sensible)
  await app.register(authPlugin)
  await app.register(multipart)
  await app.register(logsRoute)
  return app
}

function makeAuthCookie(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const token = app.jwt.sign({ sub: '1', username: 'tester' })
  return `token=${token}`
}

describe('POST /api/v1/logs/upload', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    app = await buildTestApp()
    mockParseLogFile.mockReset()
    mockScrubText.mockReset().mockResolvedValue(STUB_SCRUB)
    mockCacheSet.mockReset().mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns 401 when not authenticated', async () => {
    const body = buildMultipartBody('test.log', 'line1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: body,
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 200 with cacheId and lineCount on success', async () => {
    mockParseLogFile.mockReturnValue(['line one', 'line two'])
    const cookieHdr = makeAuthCookie(app)
    const body = buildMultipartBody('test.log', 'line one\nline two')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: cookieHdr,
      },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json() as { cacheId: string; lineCount: number; redactionSummary: [] }
    expect(typeof data.cacheId).toBe('string')
    expect(data.cacheId.length).toBeGreaterThan(0)
    expect(data.lineCount).toBe(2)
    expect(Array.isArray(data.redactionSummary)).toBe(true)
    // Scrubber and cache should have been called
    expect(mockScrubText).toHaveBeenCalledWith('line one\nline two')
    expect(mockCacheSet).toHaveBeenCalledWith(1, expect.any(String), 'line one\nline two')
  })

  it('returns 415 for unsupported file extension', async () => {
    const cookieHdr = makeAuthCookie(app)
    const body = buildMultipartBody('data.csv', 'a,b,c')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: cookieHdr,
      },
      payload: body,
    })

    expect(res.statusCode).toBe(415)
    expect(mockParseLogFile).not.toHaveBeenCalled()
    expect(mockScrubText).not.toHaveBeenCalled()
  })

  it('returns 422 when parseLogFile throws ParseError', async () => {
    const { ParseError } = await import('../services/logFileParser.js')
    mockParseLogFile.mockImplementation(() => {
      throw new ParseError('Invalid JSON: expected array', undefined)
    })
    const cookieHdr = makeAuthCookie(app)
    const body = buildMultipartBody('bad.json', '{not an array}')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: cookieHdr,
      },
      payload: body,
    })

    expect(res.statusCode).toBe(422)
    const data = res.json() as { message: string }
    expect(data.message).toContain('Invalid JSON')
  })

  it('returns 422 with lineNumber when ndjson parse fails on a specific line', async () => {
    const { ParseError } = await import('../services/logFileParser.js')
    mockParseLogFile.mockImplementation(() => {
      throw new ParseError('Invalid NDJSON: line 3 is not valid JSON', 3)
    })
    const cookieHdr = makeAuthCookie(app)
    const body = buildMultipartBody('events.ndjson', '{"a":1}\n{"b":2}\nbad')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: cookieHdr,
      },
      payload: body,
    })

    expect(res.statusCode).toBe(422)
    const data = res.json() as { message: string; lineNumber: number }
    expect(data.lineNumber).toBe(3)
  })

  it('returns 502 when scrubber returns an error', async () => {
    mockParseLogFile.mockReturnValue(['line1'])
    const { ScrubUnavailableError } = await import('../services/scrubService.js')
    mockScrubText.mockRejectedValue(new ScrubUnavailableError('Scrubber returned 500'))

    const cookieHdr = makeAuthCookie(app)
    const body = buildMultipartBody('test.log', 'line1')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: cookieHdr,
      },
      payload: body,
    })

    expect(res.statusCode).toBe(502)
    expect(mockCacheSet).not.toHaveBeenCalled()
  })

  it('returns 504 when scrubber times out', async () => {
    mockParseLogFile.mockReturnValue(['line1'])
    const { ScrubTimeoutError } = await import('../services/scrubService.js')
    mockScrubText.mockRejectedValue(new ScrubTimeoutError())

    const cookieHdr = makeAuthCookie(app)
    const body = buildMultipartBody('test.log', 'line1')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/logs/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        cookie: cookieHdr,
      },
      payload: body,
    })

    expect(res.statusCode).toBe(504)
    expect(mockCacheSet).not.toHaveBeenCalled()
  })
})
