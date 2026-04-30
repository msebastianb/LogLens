/**
 * Unit tests for scrubService.
 *
 * Mocks: global fetch, env
 * Tests:
 *   - returns redactedText + summary on 200 from scrubber
 *   - throws ScrubUnavailableError on non-200 scrubber response
 *   - throws ScrubUnavailableError on network error
 *   - throws ScrubTimeoutError when AbortSignal.timeout fires
 *   - throws ScrubValidationError when scrubber returns 422
 *   - forwards custom_patterns in fetch body when provided
 *   - omits custom_patterns from fetch body when not provided
 * [Source: story-3.1, task 4, AC3, AC4; story-3.4, AC1, AC3]
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ScrubUnavailableError, ScrubTimeoutError, ScrubValidationError } from './scrubService.js'

vi.mock('../config/env.js', () => ({
  env: {
    SCRUBBER_URL: 'http://scrubber-test:8001',
    SCRUBBER_TIMEOUT_MS: 5000,
    SESSION_TTL_SECONDS: 28800,
    NODE_ENV: 'test',
  },
}))

// Import after mock is hoisted
const { scrubText } = await import('./scrubService.js')

const STUB_RESPONSE = {
  redacted_text: 'Hello [REDACTED_PER]',
  redaction_summary: [{ entity_type: 'PER', start: 6, end: 11, placeholder: '[REDACTED_PER]' }],
}

describe('scrubText', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns redactedText and redactionSummary on 200 response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(STUB_RESPONSE), { status: 200 }),
    )

    const result = await scrubText('Hello John')
    expect(result.redactedText).toBe('Hello [REDACTED_PER]')
    expect(result.redactionSummary).toHaveLength(1)
    expect(result.redactionSummary[0].entity_type).toBe('PER')
  })

  it('posts JSON body to SCRUBBER_URL/scrub', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(STUB_RESPONSE), { status: 200 }),
    )

    await scrubText('some text')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('http://scrubber-test:8001/scrub')
    expect(init?.method).toBe('POST')
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({ text: 'some text' })
  })

  it('throws ScrubUnavailableError when scrubber returns 500', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 500 }))

    await expect(scrubText('text')).rejects.toBeInstanceOf(ScrubUnavailableError)
  })

  it('throws ScrubUnavailableError when fetch rejects (network error)', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'))

    await expect(scrubText('text')).rejects.toBeInstanceOf(ScrubUnavailableError)
  })

  it('throws ScrubTimeoutError when AbortSignal.timeout fires', async () => {
    vi.mocked(fetch).mockImplementation((_url, init) => {
      // Simulate the timeout signal already being aborted
      const signal = init?.signal as AbortSignal
      if (signal?.aborted) {
        const err = new DOMException('signal timed out', 'TimeoutError')
        return Promise.reject(err)
      }
      return Promise.reject(new DOMException('signal timed out', 'TimeoutError'))
    })

    // Provide a pre-aborted timeout to simulate timeout scenario
    vi.stubGlobal('AbortSignal', {
      ...AbortSignal,
      timeout: (_ms: number) => {
        const c = new AbortController()
        c.abort()
        Object.defineProperty(c.signal, 'name', { value: 'TimeoutError' })
        return c.signal
      },
      any: (signals: AbortSignal[]) => signals[0],
    })

    await expect(scrubText('text')).rejects.toBeInstanceOf(ScrubTimeoutError)
  })

  it('throws ScrubValidationError when scrubber returns 422', async () => {
    const detail = { detail: [{ msg: 'Invalid regex pattern' }] }
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(detail), { status: 422 }),
    )

    const err = await scrubText('text').catch((e) => e)
    expect(err).toBeInstanceOf(ScrubValidationError)
    expect((err as ScrubValidationError).detail).toEqual(detail)
  })

  it('includes custom_patterns in fetch body when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(STUB_RESPONSE), { status: 200 }),
    )

    await scrubText('some text', { customPatterns: ['PROJ-[0-9]+'] })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({
      text: 'some text',
      custom_patterns: ['PROJ-[0-9]+'],
    })
  })

  it('omits custom_patterns from fetch body when not provided', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(STUB_RESPONSE), { status: 200 }),
    )

    await scrubText('some text')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const parsed = JSON.parse((init?.body as string) ?? '{}')
    expect(parsed).not.toHaveProperty('custom_patterns')
  })
})
