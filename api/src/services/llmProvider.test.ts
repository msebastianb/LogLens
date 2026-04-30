/**
 * Unit tests for llmProviderFactory, OpenAIProvider, OpenAICompatibleProvider.
 *
 * Mocks: global fetch.
 * [Source: story-4.1, AC1, AC2, AC3, AC4, AC5]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Env } from '../config/env.js'
import { llmProviderFactory, ConfigurationError } from './llmProvider.js'

// ─── fetch mock ─────────────────────────────────────────────────────────────

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

// ─── SSE stream helper ───────────────────────────────────────────────────────

function makeSseStream(tokens: string[]): { ok: boolean; status: number; body: ReadableStream } {
  const encoder = new TextEncoder()
  const lines = tokens.map(
    (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`,
  )
  lines.push('data: [DONE]\n\n')
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    },
  })
  return { ok: true, status: 200, body: stream }
}

// ─── Factory tests ───────────────────────────────────────────────────────────

describe('llmProviderFactory', () => {
  it('returns a provider with stream() for LLM_PROVIDER=openai', () => {
    const env = { LLM_PROVIDER: 'openai', LLM_API_KEY: 'test-key' } as unknown as Env
    const provider = llmProviderFactory(env)
    expect(provider).toBeDefined()
    expect(typeof provider.stream).toBe('function')
  })

  it('returns a provider with stream() for LLM_PROVIDER=openai-compatible', () => {
    const env = {
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'local-key',
      LLM_BASE_URL: 'http://localhost:1234',
    } as unknown as Env
    const provider = llmProviderFactory(env)
    expect(provider).toBeDefined()
    expect(typeof provider.stream).toBe('function')
  })

  it('throws ConfigurationError when LLM_PROVIDER is undefined', () => {
    const env = {} as unknown as Env
    expect(() => llmProviderFactory(env)).toThrow(ConfigurationError)
    expect(() => llmProviderFactory(env)).toThrow(/no llm provider configured/i)
  })

  it('throws ConfigurationError for openai-compatible when LLM_BASE_URL is missing', () => {
    const env = { LLM_PROVIDER: 'openai-compatible', LLM_API_KEY: 'key' } as unknown as Env
    expect(() => llmProviderFactory(env)).toThrow(ConfigurationError)
  })

  it('returns a provider with stream() for LLM_PROVIDER=anthropic', () => {
    const env = {
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'ant-key',
      LLM_BASE_URL: 'https://api.anthropic.com/v1',
    } as unknown as Env
    const provider = llmProviderFactory(env)
    expect(provider).toBeDefined()
    expect(typeof provider.stream).toBe('function')
  })

  it('throws ConfigurationError for anthropic when LLM_BASE_URL is missing', () => {
    const env = { LLM_PROVIDER: 'anthropic', LLM_API_KEY: 'ant-key' } as unknown as Env
    expect(() => llmProviderFactory(env)).toThrow(ConfigurationError)
    expect(() => llmProviderFactory(env)).toThrow(/LLM_BASE_URL is required for anthropic/i)
  })
})

// ─── OpenAIProvider streaming tests ─────────────────────────────────────────

describe('OpenAIProvider.stream', () => {
  it('posts to https://api.openai.com/v1/chat/completions', async () => {
    mockFetch.mockResolvedValue(makeSseStream(['Hello', ' world']))
    const env = { LLM_PROVIDER: 'openai', LLM_API_KEY: 'my-key' } as unknown as Env
    const provider = llmProviderFactory(env)
    const signal = new AbortController().signal

    const tokens: string[] = []
    for await (const token of provider.stream('test prompt', signal)) {
      tokens.push(token)
    }

    expect(mockFetch).toHaveBeenCalledOnce()
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toBe('https://api.openai.com/v1/chat/completions')
    expect(tokens).toEqual(['Hello', ' world'])
  })

  it('sends Authorization header with API key', async () => {
    mockFetch.mockResolvedValue(makeSseStream([]))
    const env = { LLM_PROVIDER: 'openai', LLM_API_KEY: 'sk-abc123' } as unknown as Env
    const provider = llmProviderFactory(env)
    for await (const _ of provider.stream('test', new AbortController().signal)) { /* consume */ }
    const callOptions = mockFetch.mock.calls[0][1] as RequestInit
    expect((callOptions.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-abc123')
  })

  it('sends the configured model in the request body', async () => {
    mockFetch.mockResolvedValue(makeSseStream([]))
    const env = { LLM_PROVIDER: 'openai', LLM_API_KEY: 'key', LLM_MODEL: 'gpt-5.4-mini' } as unknown as Env
    const provider = llmProviderFactory(env)
    for await (const _ of provider.stream('test', new AbortController().signal)) { /* consume */ }
    const callOptions = mockFetch.mock.calls[0][1] as RequestInit
    const body = JSON.parse(callOptions.body as string) as { model: string }
    expect(body.model).toBe('gpt-5.4-mini')
  })

  it('sends the default model when LLM_MODEL is not set', async () => {
    mockFetch.mockResolvedValue(makeSseStream([]))
    const env = { LLM_PROVIDER: 'openai', LLM_API_KEY: 'key' } as unknown as Env
    const provider = llmProviderFactory(env)
    for await (const _ of provider.stream('test', new AbortController().signal)) { /* consume */ }
    const callOptions = mockFetch.mock.calls[0][1] as RequestInit
    const body = JSON.parse(callOptions.body as string) as { model: string }
    expect(body.model).toBe('gpt-5.4-mini')
    expect(body.model).toBeTruthy()
  })
})

// ─── OpenAICompatibleProvider streaming tests ────────────────────────────────

describe('OpenAICompatibleProvider.stream', () => {
  it('posts to LLM_BASE_URL — not api.openai.com', async () => {
    mockFetch.mockResolvedValue(makeSseStream(['Hi', ' there']))
    const env = {
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'local-key',
      LLM_BASE_URL: 'http://localhost:1234',
    } as unknown as Env
    const provider = llmProviderFactory(env)
    const signal = new AbortController().signal

    const tokens: string[] = []
    for await (const token of provider.stream('test', signal)) {
      tokens.push(token)
    }

    expect(mockFetch).toHaveBeenCalledOnce()
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('localhost:1234')
    expect(calledUrl).not.toContain('api.openai.com')
    expect(tokens).toEqual(['Hi', ' there'])
  })

  it('uses LM Studio base URL when configured', async () => {
    mockFetch.mockResolvedValue(makeSseStream(['ok']))
    const env = {
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: '',
      LLM_BASE_URL: 'http://192.168.1.10:1234',
    } as unknown as Env
    const provider = llmProviderFactory(env)
    for await (const _ of provider.stream('test', new AbortController().signal)) { /* consume */ }
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toBe('http://192.168.1.10:1234/v1/chat/completions')
    expect(calledUrl).not.toContain('api.openai.com')
  })

  it('strips trailing slash from LLM_BASE_URL before building request URL', async () => {
    mockFetch.mockResolvedValue(makeSseStream(['ok']))
    const env = {
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: '',
      LLM_BASE_URL: 'http://localhost:1234/',
    } as unknown as Env
    const provider = llmProviderFactory(env)
    for await (const _ of provider.stream('test', new AbortController().signal)) { /* consume */ }
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toBe('http://localhost:1234/v1/chat/completions')
    // path must not contain double slash (the :// in the protocol is fine)
    expect(calledUrl.replace('http://', '')).not.toContain('//')
  })
})
