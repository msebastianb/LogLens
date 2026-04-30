# Story 4.1: LLM provider configuration

Status: done

## Story

As an administrator,
I want to configure a remote or local LLM provider via environment variables,
So that LogLens can send analysis requests to the correct endpoint without code changes across deployment contexts.

## Acceptance Criteria

1. **Given** `LLM_PROVIDER=openai` and `LLM_API_KEY` are set, **When** the `api` container starts, **Then** Zod env validation passes and the `LLMProvider` factory resolves an OpenAI-compatible client.

2. **Given** `LLM_PROVIDER=openai-compatible` and `LLM_BASE_URL` are set, **When** an analysis request is made, **Then** Fastify sends the chat completions request to `LLM_BASE_URL` using the OpenAI streaming API format; no OpenAI domain is contacted.

3. **Given** `LLM_BASE_URL` points to an LM Studio instance on the local network, **When** an analysis request is made, **Then** all LLM calls are made to that URL only; no external network calls occur during analysis.

4. **Given** `LLM_PROVIDER` is not set, **When** a user attempts to start an analysis, **Then** Fastify returns RFC 7807 `503 Service Unavailable` with a message indicating no LLM provider is configured.

5. **Given** all providers, **When** the `LLMProvider` interface is called, **Then** the method signature is `stream(prompt: string, signal: AbortSignal): AsyncIterable<string>` — no provider-specific code exists outside `api/src/services/llmProvider.ts`.

## Tasks / Subtasks

- [x] Task 1 — Create `api/src/services/llmProvider.ts` (AC1, AC2, AC3, AC4, AC5)
  - [x] Define `LLMProvider` interface: `stream(prompt: string, signal: AbortSignal): AsyncIterable<string>`
  - [x] Define `ConfigurationError` class (thrown when `LLM_PROVIDER` not set)
  - [x] Implement `llmProviderFactory(env)`: returns appropriate provider instance based on `env.LLM_PROVIDER`
  - [x] Implement `OpenAIProvider` (for `LLM_PROVIDER=openai`): uses `env.LLM_API_KEY`; base URL = `https://api.openai.com`
  - [x] Implement `OpenAICompatibleProvider` (for `LLM_PROVIDER=openai-compatible`): uses `env.LLM_BASE_URL`; same OpenAI streaming wire format
  - [x] Anthropic uses `openai-compatible` adapter — no separate Anthropic SDK client needed
  - [x] Both providers POST to `/v1/chat/completions` with `stream: true`; yield tokens from SSE `data:` chunks

- [x] Task 2 — Create `api/src/routes/analysis.ts` — stub `POST /api/v1/analysis-jobs` (AC4)
  - [x] Require auth (`onRequest: [app.authenticate]`)
  - [x] Call `llmProviderFactory(env)` — on `ConfigurationError` return 503 RFC 7807
  - [x] For now return `{ jobId: crypto.randomUUID() }` with status 201 (full streaming wired in Story 4.3)
  - [x] No SSE stream in this story — that is Story 4.3

- [x] Task 3 — Register route in `api/src/app.ts`
  - [x] Import `analysisRoute` from `./routes/analysis.js`
  - [x] Add `await app.register(analysisRoute)` alongside other routes

- [x] Task 4 — Vitest unit tests `api/src/services/llmProvider.test.ts`
  - [x] `llmProviderFactory(env)`: returns provider instance when `LLM_PROVIDER=openai`
  - [x] `llmProviderFactory(env)`: returns provider instance when `LLM_PROVIDER=openai-compatible`
  - [x] `llmProviderFactory(env)`: throws `ConfigurationError` when `LLM_PROVIDER` is undefined
  - [x] TypeScript compilation validates `stream()` contract on both providers (compile-time only)
  - [x] `OpenAIProvider.stream()`: sends POST to `https://api.openai.com/v1/chat/completions` with correct headers
  - [x] `OpenAICompatibleProvider.stream()`: sends POST to `env.LLM_BASE_URL/v1/chat/completions` — no OpenAI domain

- [x] Task 5 — Vitest unit tests `api/src/routes/analysis.test.ts`
  - [x] `POST /api/v1/analysis-jobs`: returns 401 without auth
  - [x] `POST /api/v1/analysis-jobs`: returns 201 `{ jobId }` when factory resolves
  - [x] `POST /api/v1/analysis-jobs`: returns RFC 7807 503 when `llmProviderFactory` throws `ConfigurationError`

- [x] Task 6 — Finalize
  - [x] Run `pnpm --filter api test` — all pass (103 tests)
  - [x] Story → review, sprint-status updated

## Dev Notes

### Architecture Contract — single file for all provider logic

**CRITICAL:** All provider-specific code lives exclusively in `api/src/services/llmProvider.ts`. The route (`analysis.ts`) only calls `llmProviderFactory(env)` and uses the returned `LLMProvider` interface. No provider-specific imports anywhere else.

```typescript
// api/src/services/llmProvider.ts — target structure

export interface LLMProvider {
  stream(prompt: string, signal: AbortSignal): AsyncIterable<string>
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

export function llmProviderFactory(env: Env): LLMProvider {
  if (!env.LLM_PROVIDER) {
    throw new ConfigurationError('No LLM provider configured. Set LLM_PROVIDER.')
  }
  switch (env.LLM_PROVIDER) {
    case 'openai':
      return new OpenAIProvider(env.LLM_API_KEY ?? '', 'https://api.openai.com', env.LLM_MODEL)
    case 'openai-compatible':
      if (!env.LLM_BASE_URL) throw new ConfigurationError('LLM_BASE_URL required for openai-compatible')
      return new OpenAICompatibleProvider(env.LLM_API_KEY ?? '', env.LLM_BASE_URL, env.LLM_MODEL)
    case 'anthropic':
      // Anthropic supports OpenAI-compatible endpoint — no separate SDK
      if (!env.LLM_BASE_URL) throw new ConfigurationError('LLM_BASE_URL required for anthropic')
      return new OpenAICompatibleProvider(env.LLM_API_KEY ?? '', env.LLM_BASE_URL)
  }
}
```

### OpenAI Streaming Wire Format

Both providers use the same OpenAI SSE streaming protocol:
- `POST /v1/chat/completions` with `{ model, messages, stream: true }`
- Response: `Content-Type: text/event-stream`
- Each chunk: `data: {"choices":[{"delta":{"content":"token"}}]}\n\n`
- Terminal: `data: [DONE]\n\n`

To implement `AsyncIterable<string>` from a streaming fetch response:

```typescript
async *stream(prompt: string, signal: AbortSignal): AsyncIterable<string> {
  const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    },
    body: JSON.stringify({
      model: this.model,  // from env.LLM_MODEL — default 'gpt-5.4-mini' (400K context, 128K output)
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
    signal,
  })
  if (!res.ok) throw new Error(`LLM provider returned ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return
      try {
        const parsed = JSON.parse(payload)
        const token = parsed.choices?.[0]?.delta?.content
        if (token) yield token
      } catch { /* skip malformed chunk */ }
    }
  }
}
```

### `LLM_PROVIDER` env var — already in `env.ts`

`api/src/config/env.ts` already declares all three LLM vars as optional:
```typescript
LLM_PROVIDER: z.enum(['openai', 'anthropic', 'openai-compatible']).optional(),
LLM_API_KEY: z.string().optional(),
LLM_BASE_URL: z.string().url().optional(),
```
**Do NOT modify `env.ts`** — these are already present and correct.

### Analysis route — stub only (Story 4.3 wires streaming)

This story creates only the POST endpoint that validates the LLM config. The actual SSE streaming (`GET /api/v1/analysis-jobs/:id/stream`) is Story 4.3. This stub:
- Validates config (503 if not configured)
- Returns `{ jobId: crypto.randomUUID() }` with 201
- Does NOT initiate any LLM call

### New route file location

`api/src/routes/analysis.ts` — mirrors the pattern of `logs.ts` and `scrub.ts`. Export `async function analysisRoute(app: FastifyInstance)`. Register in `app.ts` after `scrubRoute`.

### Test patterns — follow `scrub.test.ts`

- `vi.hoisted()` for mock function declarations
- `vi.mock('../services/llmProvider.js', ...)` — mock `llmProviderFactory` and `ConfigurationError`
- `buildTestApp()` with cookie, jwt, sensible, authPlugin, analysisRoute
- `makeAuthCookie(app)` via `app.jwt.sign({ sub: '1', username: 'tester' })`
- `app.inject()` — not supertest

For `llmProvider.test.ts`:
- Mock `fetch` globally with `vi.stubGlobal('fetch', vi.fn())`
- Test `llmProviderFactory` directly (no Fastify needed)
- Test that `OpenAICompatibleProvider.stream()` posts to `LLM_BASE_URL`, not to `api.openai.com`

### Project Structure Notes

- New file: `api/src/services/llmProvider.ts` — all provider logic
- New file: `api/src/services/llmProvider.test.ts` — factory + provider unit tests
- New file: `api/src/routes/analysis.ts` — stub POST /api/v1/analysis-jobs
- New file: `api/src/routes/analysis.test.ts` — route unit tests
- Update: `api/src/app.ts` — register `analysisRoute`
- No DB changes, no env.ts changes, no schema changes

### References

- [Source: epics.md — Story 4.1 AC and Test Scenarios]
- [Source: architecture.md — LLM Provider Interface Contract: `stream(prompt, signal): AsyncIterable<string>`]
- [Source: architecture.md — Environment Variables Table: LLM_PROVIDER, LLM_API_KEY, LLM_BASE_URL]
- [Source: architecture.md — Requirements to Structure Mapping: `api/src/services/llmProvider.ts`, `api/src/routes/analysis.ts`]
- [Source: api/src/config/env.ts — LLM vars already declared optional]
- [Source: api/src/routes/scrub.ts — route pattern, auth guard, error handling]
- [Source: api/src/routes/scrub.test.ts — Vitest test pattern: vi.hoisted, buildTestApp, makeAuthCookie]
- [Source: api/src/app.ts — route registration pattern]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (GitHub Copilot)

### Debug Log References

### Completion Notes List

- Implemented `LLMProvider` interface + `ConfigurationError` + `llmProviderFactory` in single file `api/src/services/llmProvider.ts` (AC5 satisfied — no provider-specific code outside this file).
- `OpenAIProvider` and `OpenAICompatibleProvider` share streaming logic via `BaseStreamProvider` base class; both use identical SSE wire format.
- Anthropic handled via `OpenAICompatibleProvider` — no extra SDK.
- `analysis.ts` is a stub: validates LLM config → 201 `{ jobId }` or 503 `ConfigurationError`; no streaming (Story 4.3).
- `env.ts` not modified — LLM vars already declared optional.
- +11 new unit tests; total 103 passing (was 92).
- Code review patches applied: guarded `res.body` null, stripped trailing slash from `LLM_BASE_URL`, added `anthropic` branch tests (+3 tests, total 106).

### File List

- api/src/services/llmProvider.ts (new)
- api/src/services/llmProvider.test.ts (new)
- api/src/routes/analysis.ts (new)
- api/src/routes/analysis.test.ts (new)
- api/src/app.ts (modified — added analysisRoute import + registration)

## Change Log

- 2026-04-28: Story 4.1 implemented — LLM provider service + analysis job stub (Amelia / claude-sonnet-4-5)
- 2026-04-28: Code review patches applied — res.body null guard, LLM_BASE_URL trailing slash strip, anthropic factory tests

## Senior Developer Review (AI)

**Outcome:** Changes Requested → All Resolved  
**Date:** 2026-04-28

### Action Items

- [x] **[High] F1** — `res.body!` non-null assertion in `BaseStreamProvider.stream` — replaced with explicit null guard [llmProvider.ts]
- [x] **[Med] F4** — Trailing slash on `LLM_BASE_URL` causes double-slash in request path — strip in constructor [llmProvider.ts]
- [x] **[Med] F7** — Missing tests for `anthropic` factory branch — added 2 tests (resolves + throws ConfigurationError) [llmProvider.test.ts]
