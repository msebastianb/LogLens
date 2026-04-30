/**
 * LLM provider abstraction.
 *
 * ALL provider-specific logic lives in this file only.
 * Consumers import `llmProviderFactory` and the `LLMProvider` interface.
 * No provider-specific imports outside this file.
 *
 * Supports:
 *   - openai           → OpenAIProvider (base URL: https://api.openai.com)
 *   - openai-compatible → OpenAICompatibleProvider (base URL: LLM_BASE_URL)
 *   - anthropic        → OpenAICompatibleProvider (Anthropic OpenAI-compatible endpoint)
 *
 * Wire format: OpenAI SSE streaming (/v1/chat/completions, stream: true).
 * [Source: architecture.md#llm-provider-interface, story-4.1]
 */
import type { Env } from '../config/env.js'

// ─── Public interface ───────────────────────────────────────────────────────

export interface LLMProvider {
  stream(prompt: string, signal: AbortSignal): AsyncIterable<string>
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function llmProviderFactory(env: Env): LLMProvider {
  if (!env.LLM_PROVIDER) {
    throw new ConfigurationError('No LLM provider configured. Set LLM_PROVIDER.')
  }
  switch (env.LLM_PROVIDER) {
    case 'openai':
      return new OpenAIProvider(env.LLM_API_KEY ?? '', 'https://api.openai.com', env.LLM_MODEL ?? 'gpt-5.4-mini')
    case 'openai-compatible':
      if (!env.LLM_BASE_URL) {
        throw new ConfigurationError('LLM_BASE_URL is required for openai-compatible provider')
      }
      return new OpenAICompatibleProvider(env.LLM_API_KEY ?? '', env.LLM_BASE_URL, env.LLM_MODEL ?? 'gpt-5.4-mini')
    case 'anthropic':
      // Anthropic exposes an OpenAI-compatible endpoint — no separate SDK needed.
      if (!env.LLM_BASE_URL) {
        throw new ConfigurationError('LLM_BASE_URL is required for anthropic provider')
      }
      return new OpenAICompatibleProvider(env.LLM_API_KEY ?? '', env.LLM_BASE_URL, env.LLM_MODEL ?? 'gpt-5.4-mini')
  }
}

// ─── Shared streaming implementation ───────────────────────────────────────

class BaseStreamProvider implements LLMProvider {
  constructor(
    protected readonly apiKey: string,
    baseUrl: string,
    protected readonly model: string,
  ) {
    // Strip trailing slash so callers with "http://host:1234/" don't produce
    // double slashes in the request path (e.g. //v1/chat/completions).
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  protected readonly baseUrl: string

  async *stream(prompt: string, signal: AbortSignal): AsyncIterable<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
      signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`LLM provider returned ${res.status}: ${body}`)
    }

    if (!res.body) {
      throw new Error('LLM provider returned a response with no body')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') return
        try {
          const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
          const token = parsed.choices?.[0]?.delta?.content
          if (token) yield token
        } catch {
          // skip malformed SSE chunk
        }
      }
    }
  }
}

// ─── Concrete providers ─────────────────────────────────────────────────────

export class OpenAIProvider extends BaseStreamProvider {
  constructor(apiKey: string, baseUrl: string = 'https://api.openai.com', model: string = 'gpt-5.4-mini') {
    super(apiKey, baseUrl, model)
  }
}

export class OpenAICompatibleProvider extends BaseStreamProvider {
  constructor(apiKey: string, baseUrl: string, model: string = 'gpt-5.4-mini') {
    super(apiKey, baseUrl, model)
  }
}
