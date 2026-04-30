/**
 * Unit tests for analysis job routes.
 *
 * POST /api/v1/analysis-jobs — create job from scrub cache
 * GET  /api/v1/analysis-jobs/:id/stream — SSE token stream
 * DELETE /api/v1/analysis-jobs/:id — cancel in-flight job
 *
 * Mocks: llmProvider, scrubCache, redisClient, config/env.
 * [Source: story-4.3, AC1–AC5; story-5.2, AC1–AC5]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import authPlugin from '../plugins/auth.js'
import { analysisRoute, jobControllers } from './analysis.js'

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockLlmProviderFactory, mockScrubCacheGet, mockScrubCacheDel, mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockLlmProviderFactory: vi.fn(),
  mockScrubCacheGet: vi.fn(),
  mockScrubCacheDel: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}))

vi.mock('../services/llmProvider.js', () => ({
  llmProviderFactory: mockLlmProviderFactory,
  ConfigurationError: class ConfigurationError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'ConfigurationError'
    }
  },
}))

vi.mock('../services/scrubCache.js', () => ({
  get: mockScrubCacheGet,
  del: mockScrubCacheDel,
}))

vi.mock('../services/redisClient.js', () => ({
  redis: { get: mockRedisGet, set: mockRedisSet },
}))

vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
    SESSION_TTL_SECONDS: 28800,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    LLM_PROVIDER: 'openai',
    LLM_API_KEY: 'test-key',
  },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  await app.register(analysisRoute)
  return app
}

function makeAuthCookie(app: Awaited<ReturnType<typeof buildTestApp>>, userId = 1) {
  const token = app.jwt.sign({ sub: String(userId), username: 'tester' })
  return `token=${token}`
}

/** Parse SSE response body into event+data pairs */
function parseSSE(body: string): Array<{ event: string; data: unknown }> {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map(block => {
      const eventMatch = block.match(/^event: (.+)$/m)
      const dataMatch = block.match(/^data: (.+)$/m)
      return {
        event: eventMatch?.[1] ?? 'message',
        data: dataMatch ? JSON.parse(dataMatch[1]) : null,
      }
    })
}

/** A valid AnalysisOutput payload for use in SSE complete events */
const validOutput = {
  errors: [{ type: 'NullPointerException', count: 2, distribution: 'clustered' }],
  anomalies: ['Spike at 03:00 UTC'],
  rootCause: { hypothesis: 'Memory leak', confidence: 'High', evidenceExcerpts: ['line 42'] },
  timeline: [{ timestamp: '2024-01-01T03:00:00Z', component: 'api', event: 'OOM' }],
  nextSteps: ['Increase heap'],
}

/** Create an async generator that yields the given tokens */
async function* makeTokenStream(tokens: string[]) {
  for (const t of tokens) yield t
}

// ─── POST /api/v1/analysis-jobs ──────────────────────────────────────────────

describe('POST /api/v1/analysis-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analysis-jobs',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ cacheId: 'some-id' }),
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when cacheId not found in scrub cache', async () => {
    mockLlmProviderFactory.mockReturnValue({ stream: vi.fn() })
    mockScrubCacheGet.mockResolvedValue(null)
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analysis-jobs',
      headers: { 'content-type': 'application/json', cookie: makeAuthCookie(app) },
      payload: JSON.stringify({ cacheId: 'missing-id' }),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json<{ message: string }>().message).toMatch(/cache entry not found/i)
  })

  it('stores job state in Redis and returns 201 with jobId', async () => {
    mockLlmProviderFactory.mockReturnValue({ stream: vi.fn() })
    mockScrubCacheGet.mockResolvedValue('scrubbed log text')
    mockRedisSet.mockResolvedValue('OK')
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analysis-jobs',
      headers: { 'content-type': 'application/json', cookie: makeAuthCookie(app) },
      payload: JSON.stringify({ cacheId: 'cache-abc' }),
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<{ jobId: string }>()
    expect(typeof body.jobId).toBe('string')
    expect(body.jobId.length).toBeGreaterThan(0)
    // Redis set was called with the job key
    expect(mockRedisSet).toHaveBeenCalledOnce()
    const [key, value] = mockRedisSet.mock.calls[0] as [string, string, ...unknown[]]
    expect(key).toMatch(/^analysis_job:/)
    const stored = JSON.parse(value) as { status: string; userId: number; cacheId: string }
    expect(stored.status).toBe('pending')
    expect(stored.userId).toBe(1)
    expect(stored.cacheId).toBe('cache-abc')
  })

  it('returns 503 when LLM provider is not configured', async () => {
    const { ConfigurationError } = await import('../services/llmProvider.js')
    mockLlmProviderFactory.mockImplementation(() => {
      throw new ConfigurationError('No LLM provider configured.')
    })
    mockScrubCacheGet.mockResolvedValue('some text')
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analysis-jobs',
      headers: { 'content-type': 'application/json', cookie: makeAuthCookie(app) },
      payload: JSON.stringify({ cacheId: 'cache-abc' }),
    })
    expect(res.statusCode).toBe(503)
    expect(res.json<{ message: string }>().message).toMatch(/no llm provider configured/i)
  })
})

// ─── GET /api/v1/analysis-jobs/:id/stream ────────────────────────────────────

describe('GET /api/v1/analysis-jobs/:id/stream', () => {
  const JOB_ID = 'job-test-1'
  const CACHE_ID = 'cache-abc'

  function makeJob(overrides: Partial<{ status: string; userId: number; cacheId: string }> = {}) {
    return JSON.stringify({
      status: 'pending',
      userId: 1,
      cacheId: CACHE_ID,
      createdAt: new Date().toISOString(),
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: `/api/v1/analysis-jobs/${JOB_ID}/stream` })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when job not found in Redis', async () => {
    mockRedisGet.mockResolvedValue(null)
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json<{ message: string }>().message).toMatch(/analysis job not found/i)
  })

  it('returns 403 when job belongs to a different user', async () => {
    mockRedisGet.mockResolvedValue(makeJob({ userId: 999 }))
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app, 1) }, // user 1 vs job owner 999
    })
    expect(res.statusCode).toBe(403)
    expect(res.json<{ message: string }>().message).toMatch(/do not have access/i)
  })

  it('responds with Content-Type: text/event-stream', async () => {
    mockRedisGet.mockResolvedValue(makeJob())
    mockScrubCacheGet.mockResolvedValue('log text')
    mockRedisSet.mockResolvedValue('OK')
    mockLlmProviderFactory.mockReturnValue({
      stream: () => makeTokenStream([]),
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })
    expect(res.headers['content-type']).toContain('text/event-stream')
  })

  it('emits event: token for each LLM token', async () => {
    mockRedisGet.mockResolvedValue(makeJob())
    mockScrubCacheGet.mockResolvedValue('log text')
    mockRedisSet.mockResolvedValue('OK')
    mockLlmProviderFactory.mockReturnValue({
      stream: () => makeTokenStream(['{"errors":', '[],']),
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })
    const events = parseSSE(res.body)
    const tokenEvents = events.filter(e => e.event === 'token')
    expect(tokenEvents).toHaveLength(2)
    expect((tokenEvents[0].data as { text: string }).text).toBe('{"errors":')
    expect((tokenEvents[1].data as { text: string }).text).toBe('[],')
  })

  it('emits event: complete when LLM returns valid structured JSON', async () => {
    mockRedisGet.mockResolvedValue(makeJob())
    mockScrubCacheGet.mockResolvedValue('log text')
    mockRedisSet.mockResolvedValue('OK')
    mockLlmProviderFactory.mockReturnValue({
      stream: () => makeTokenStream([JSON.stringify(validOutput)]),
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })
    const events = parseSSE(res.body)
    const completeEvents = events.filter(e => e.event === 'complete')
    expect(completeEvents).toHaveLength(1)
    expect((completeEvents[0].data as typeof validOutput).rootCause.hypothesis).toBe('Memory leak')
  })

  it('emits event: error when LLM assembled JSON fails schema validation', async () => {
    mockRedisGet.mockResolvedValue(makeJob())
    mockScrubCacheGet.mockResolvedValue('log text')
    mockRedisSet.mockResolvedValue('OK')
    mockLlmProviderFactory.mockReturnValue({
      stream: () => makeTokenStream(['{"not":"valid schema"}']),
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })
    const events = parseSSE(res.body)
    const errorEvents = events.filter(e => e.event === 'error')
    expect(errorEvents).toHaveLength(1)
    expect((errorEvents[0].data as { statusCode: number }).statusCode).toBe(502)
    expect((errorEvents[0].data as { message: string }).message).toMatch(/invalid structured output/i)
  })

  it('emits event: error when LLM stream throws', async () => {
    mockRedisGet.mockResolvedValue(makeJob())
    mockScrubCacheGet.mockResolvedValue('log text')
    mockRedisSet.mockResolvedValue('OK')
    mockLlmProviderFactory.mockReturnValue({
      stream: async function* () {
        yield 'partial'
        throw new Error('Connection reset by peer')
      },
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })
    const events = parseSSE(res.body)
    const errorEvents = events.filter(e => e.event === 'error')
    expect(errorEvents).toHaveLength(1)
    expect((errorEvents[0].data as { message: string }).message).toMatch(/connection reset/i)
  })

  it('emits event: error when nextSteps is empty array (Zod min(1))', async () => {
    mockRedisGet.mockResolvedValue(makeJob())
    mockScrubCacheGet.mockResolvedValue('log text')
    mockRedisSet.mockResolvedValue('OK')
    mockLlmProviderFactory.mockReturnValue({
      stream: () => makeTokenStream([JSON.stringify({ ...validOutput, nextSteps: [] })]),
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })
    const events = parseSSE(res.body)
    const errorEvents = events.filter(e => e.event === 'error')
    expect(errorEvents).toHaveLength(1)
    expect((errorEvents[0].data as { statusCode: number }).statusCode).toBe(502)
    expect((errorEvents[0].data as { message: string }).message).toMatch(/invalid structured output/i)
  })

  it('does not overwrite Redis status when stream is aborted (AbortError)', async () => {
    mockRedisGet.mockResolvedValue(makeJob())
    mockScrubCacheGet.mockResolvedValue('log text')
    mockRedisSet.mockResolvedValue('OK')
    mockLlmProviderFactory.mockReturnValue({
      stream: async function* () {
        yield 'partial'
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        throw err
      },
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })
    // No event: error should be emitted for an abort
    const events = parseSSE(res.body)
    expect(events.filter(e => e.event === 'error')).toHaveLength(0)
    // Redis should NOT have been updated (cancelled status preserved)
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it('emits progress event at the start of single-chunk analysis', async () => {
    mockRedisGet.mockResolvedValue(makeJob())
    mockScrubCacheGet.mockResolvedValue('short log')
    mockRedisSet.mockResolvedValue('OK')
    mockLlmProviderFactory.mockReturnValue({
      stream: () => makeTokenStream([JSON.stringify(validOutput)]),
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })
    const events = parseSSE(res.body)
    const progressEvents = events.filter(e => e.event === 'progress')
    expect(progressEvents.length).toBeGreaterThanOrEqual(1)
    expect((progressEvents[0].data as { stage: string; totalChunks: number }).stage).toBe('analysing')
    expect((progressEvents[0].data as { totalChunks: number }).totalChunks).toBe(1)
  })

  it('splits large logs into multiple chunks and emits merge progress', async () => {
    // Create text that exceeds MAX_CHUNK_CHARS (3.9M) so it splits into 2 chunks
    const bigLog = 'A'.repeat(4_000_000) + '\n' + 'B'.repeat(100)

    // Track how many times stream() is called
    let streamCallCount = 0
    mockRedisGet.mockResolvedValue(makeJob())
    mockScrubCacheGet.mockResolvedValue(bigLog)
    mockRedisSet.mockResolvedValue('OK')
    mockLlmProviderFactory.mockReturnValue({
      stream: () => {
        streamCallCount++
        // First three calls are chunk analyses, fourth is merge
        if (streamCallCount <= 3) {
          return makeTokenStream([JSON.stringify(validOutput)])
        }
        // Merge call returns combined output
        return makeTokenStream([JSON.stringify(validOutput)])
      },
    })

    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
      headers: { cookie: makeAuthCookie(app) },
    })

    const events = parseSSE(res.body)
    const progressEvents = events.filter(e => e.event === 'progress')

    // Should have: initial progress, chunk 1–3 progress, merge progress
    expect(progressEvents.length).toBeGreaterThanOrEqual(4)

    // Verify merge stage exists
    const mergeEvent = progressEvents.find(
      e => (e.data as { stage: string }).stage === 'merging',
    )
    expect(mergeEvent).toBeDefined()

    // LLM should have been called 4 times: chunk 1, chunk 2, chunk 3, merge
    // (4M chars / 1.57M MAX_CHUNK_CHARS ≈ 3 chunks)
    expect(streamCallCount).toBe(4)

    // Should still emit complete event
    const completeEvents = events.filter(e => e.event === 'complete')
    expect(completeEvents).toHaveLength(1)
  })
})

// ─── DELETE /api/v1/analysis-jobs/:id ────────────────────────────────────────

describe('DELETE /api/v1/analysis-jobs/:id', () => {
  const JOB_ID = 'job-del-1'
  const CACHE_ID = 'cache-del'

  function makeJob(overrides: Partial<{ status: string; userId: number; cacheId: string }> = {}) {
    return JSON.stringify({
      status: 'pending',
      userId: 1,
      cacheId: CACHE_ID,
      createdAt: new Date().toISOString(),
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    jobControllers.clear()
    mockRedisSet.mockResolvedValue('OK')
    mockScrubCacheDel.mockResolvedValue(undefined)
  })

  it('returns 401 without auth', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/analysis-jobs/${JOB_ID}` })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when job not found in Redis', async () => {
    mockRedisGet.mockResolvedValue(null)
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/analysis-jobs/${JOB_ID}`,
      headers: { cookie: makeAuthCookie(app) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json<{ message: string }>().message).toMatch(/analysis job not found/i)
  })

  it('returns 403 when job belongs to a different user', async () => {
    mockRedisGet.mockResolvedValue(makeJob({ userId: 999 }))
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/analysis-jobs/${JOB_ID}`,
      headers: { cookie: makeAuthCookie(app, 1) },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json<{ message: string }>().message).toMatch(/do not have access/i)
  })

  it('aborts controller, deletes scrub cache, and returns 204 for in-progress job', async () => {
    mockRedisGet.mockResolvedValue(makeJob())
    const controller = new AbortController()
    const abortSpy = vi.spyOn(controller, 'abort')
    jobControllers.set(JOB_ID, controller)

    const app = await buildTestApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/analysis-jobs/${JOB_ID}`,
      headers: { cookie: makeAuthCookie(app) },
    })

    expect(res.statusCode).toBe(204)
    expect(abortSpy).toHaveBeenCalledOnce()
    expect(mockScrubCacheDel).toHaveBeenCalledWith(1, CACHE_ID)
    const [, value] = mockRedisSet.mock.calls[0] as [string, string, ...unknown[]]
    expect(JSON.parse(value).status).toBe('cancelled')
  })

  it('returns 204 without aborting when job is already complete (idempotent)', async () => {
    mockRedisGet.mockResolvedValue(makeJob({ status: 'complete' }))
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/analysis-jobs/${JOB_ID}`,
      headers: { cookie: makeAuthCookie(app) },
    })
    expect(res.statusCode).toBe(204)
    expect(mockScrubCacheDel).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })
})

