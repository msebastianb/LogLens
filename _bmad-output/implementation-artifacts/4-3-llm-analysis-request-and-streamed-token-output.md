# Story 4.3: LLM analysis request and streamed token output

Status: done

## Story

As a user,
I want to submit scrubbed logs for analysis and see the LLM's response stream to the screen token by token as it is generated,
So that I get immediate feedback and don't wait for a full response before seeing results.

## Acceptance Criteria

1. **Given** I click "Analyse" after confirming the redaction review, **When** the analysis job is created, **Then** `POST /api/v1/analysis-jobs` returns a job ID and the pipeline transitions to `analysing`.

2. **Given** a valid analysis job ID, **When** I connect to `GET /api/v1/analysis-jobs/:id/stream`, **Then** the response is `Content-Type: text/event-stream` and SSE token events begin within 5 seconds of the LLM call being initiated.

3. **Given** the LLM is streaming tokens, **When** each token arrives, **Then** Fastify forwards it as an SSE `event: token` with `data: { text: string }` and the UI appends it to the analysis output without re-rendering the full component tree.

4. **Given** the LLM stream completes, **When** the final response is assembled, **Then** Fastify validates the structured payload against the Zod output schema before emitting `event: complete`; a schema violation returns RFC 7807 `502` instead of a malformed complete event.

5. **Given** the LLM call fails mid-stream (network error or provider error), **When** the stream breaks, **Then** Fastify emits `event: error` with an RFC 7807 payload and the pipeline transitions to `error` state.

## Tasks / Subtasks

- [x] Task 1 — Upgrade `POST /api/v1/analysis-jobs` to initiate real LLM call (AC1)
  - [x] Accept request body: `{ cacheId: string }` — retrieve scrubbed text from Redis via `scrubCache.get(userId, cacheId)`
  - [x] On cache miss → 404 RFC 7807 `{ message: 'Cache entry not found or expired' }`
  - [x] Call `llmProviderFactory(env)` to get provider instance (reuse for this request)
  - [x] Store job state in Redis key `analysis_job:{jobId}` with TTL = `SESSION_TTL_SECONDS`: `{ status: 'pending', userId, cacheId, createdAt }`
  - [x] Return `{ jobId }` 201 — do NOT block waiting for LLM; streaming happens on the GET route

- [x] Task 2 — Create `GET /api/v1/analysis-jobs/:id/stream` SSE endpoint (AC2, AC3, AC4, AC5)
  - [x] Auth required (`onRequest: [app.authenticate]`)
  - [x] Look up job in Redis `analysis_job:{id}` — 404 if missing
  - [x] Verify `job.userId === req.user.id` — 403 if mismatch (ownership check)
  - [x] Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
  - [x] Call `llmProviderFactory(env).stream(prompt, req.signal)` — pass `req.signal` for abort on client disconnect
  - [x] Forward each token as: `event: token\ndata: {"text":"<token>"}\n\n`
  - [x] Accumulate all tokens into `fullText: string`
  - [x] On LLM stream complete: parse `fullText` with `parseAnalysisJson(fullText)` helper → validate against Zod `AnalysisOutputSchema`
    - [x] Valid → emit `event: complete\ndata: <json>\n\n`
    - [x] Invalid → emit `event: error\ndata: {"statusCode":502,"error":"Bad Gateway","message":"LLM returned invalid structured output"}\n\n`
  - [x] On LLM stream error: emit `event: error\ndata: {"statusCode":502,"error":"Bad Gateway","message":"<err.message>"}\n\n`
  - [x] Update job status in Redis to `complete` or `error` after stream ends
  - [x] Build prompt string from scrubbed text (see prompt template in Dev Notes)

- [x] Task 3 — Create `api/src/services/analysisOutputSchema.ts` (AC4)
  - [x] Define and export `AnalysisOutputSchema` (Zod) matching architecture data exchange format:
    ```typescript
    z.object({
      errors: z.array(z.object({ type: z.string(), count: z.number(), distribution: z.string() })),
      anomalies: z.array(z.string()),
      rootCause: z.object({ hypothesis: z.string(), confidence: z.enum(['High','Medium','Low']), evidenceExcerpts: z.array(z.string()) }),
      timeline: z.array(z.object({ timestamp: z.string(), component: z.string(), event: z.string() })),
      nextSteps: z.array(z.string()).min(1),
    })
    ```
  - [x] Export `AnalysisOutput` type: `z.infer<typeof AnalysisOutputSchema>`
  - [x] Export `parseAnalysisJson(text: string): AnalysisOutput` — strips markdown fences if present, then JSON.parse + safeParse

- [x] Task 4 — Vitest unit tests `api/src/routes/analysis.test.ts` (update existing file)
  - [x] `POST /api/v1/analysis-jobs`: returns 404 when `cacheId` not found in Redis
  - [x] `POST /api/v1/analysis-jobs`: stores job state in Redis and returns 201 `{ jobId }`
  - [x] `GET /api/v1/analysis-jobs/:id/stream`: returns 401 without auth
  - [x] `GET /api/v1/analysis-jobs/:id/stream`: returns 404 when job not found
  - [x] `GET /api/v1/analysis-jobs/:id/stream`: returns 403 when userId mismatch
  - [x] `GET /api/v1/analysis-jobs/:id/stream`: `Content-Type` is `text/event-stream`
  - [x] `GET /api/v1/analysis-jobs/:id/stream`: emits `event: token` for each LLM token
  - [x] `GET /api/v1/analysis-jobs/:id/stream`: emits `event: complete` when valid JSON assembled
  - [x] `GET /api/v1/analysis-jobs/:id/stream`: emits `event: error` when JSON fails schema validation
  - [x] `GET /api/v1/analysis-jobs/:id/stream`: emits `event: error` on LLM stream error

- [x] Task 5 — Vitest unit tests `api/src/services/analysisOutputSchema.test.ts`
  - [x] `AnalysisOutputSchema`: accepts valid complete payload
  - [x] `AnalysisOutputSchema`: rejects missing `errors` field
  - [x] `AnalysisOutputSchema`: rejects missing `anomalies` field
  - [x] `AnalysisOutputSchema`: rejects missing `rootCause` field
  - [x] `AnalysisOutputSchema`: rejects missing `timeline` field
  - [x] `AnalysisOutputSchema`: rejects `nextSteps` empty array
  - [x] `parseAnalysisJson`: strips ```json markdown fences before parsing
  - [x] `parseAnalysisJson`: throws on non-JSON input

- [x] Task 6 — Finalize
  - [x] Run `pnpm --filter api test` — all pass
  - [x] Story → review, sprint-status updated

## Dev Notes

### Critical: `analysis.ts` is a STUB — replace, not add

`api/src/routes/analysis.ts` currently contains only the Story 4.1 stub (validates config, returns `{ jobId }`). This story **replaces** the entire handler body of `POST /api/v1/analysis-jobs` AND adds the new `GET /api/v1/analysis-jobs/:id/stream` route in the **same file**. Do NOT create a new file — extend `analysisRoute`.

### SSE wire format (Fastify — no library needed)

Fastify does not have a built-in SSE helper. Write SSE manually by:

```typescript
// Inside GET /:id/stream handler:
reply.raw.setHeader('Content-Type', 'text/event-stream')
reply.raw.setHeader('Cache-Control', 'no-cache')
reply.raw.setHeader('Connection', 'keep-alive')
reply.raw.flushHeaders()

// Emit helper
function sendEvent(raw: ServerResponse, event: string, data: unknown) {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}
```

Use `reply.raw` (Node.js `ServerResponse`) directly — do NOT use `reply.send()` on an SSE route, it ends the response. Return `reply` at the end of the handler to satisfy Fastify's return type.

### Redis job key scheme

```
analysis_job:{jobId}   TTL = SESSION_TTL_SECONDS
Value: JSON string
{
  status: 'pending' | 'complete' | 'error',
  userId: number,
  cacheId: string,
  createdAt: string   // ISO timestamp
}
```

Use `redis.set(key, JSON.stringify(job), 'EX', env.SESSION_TTL_SECONDS)` and `redis.get(key)` then `JSON.parse`. Import `redis` from `'../services/redisClient.js'` and `env` from `'../config/env.js'`.

### Prompt template

Build the analysis prompt from the scrubbed text:

```typescript
function buildPrompt(scrubbedText: string): string {
  return [
    'You are a log analysis expert. Analyse the following scrubbed log content.',
    'Respond ONLY with a JSON object (no markdown fences, no prose) matching this schema:',
    '{ "errors": [{ "type": string, "count": number, "distribution": string }],',
    '  "anomalies": [string],',
    '  "rootCause": { "hypothesis": string, "confidence": "High"|"Medium"|"Low", "evidenceExcerpts": [string] },',
    '  "timeline": [{ "timestamp": string, "component": string, "event": string }],',
    '  "nextSteps": [string] }',
    '',
    'Log content:',
    scrubbedText,
  ].join('\n')
}
```

### `parseAnalysisJson` — strip markdown fences

LLMs often wrap JSON in ```json ... ``` fences even when asked not to. Strip them:

```typescript
export function parseAnalysisJson(text: string): AnalysisOutput {
  const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const parsed = AnalysisOutputSchema.safeParse(JSON.parse(stripped))
  if (!parsed.success) {
    throw new Error('Schema validation failed: ' + JSON.stringify(parsed.error.flatten()))
  }
  return parsed.data
}
```

### AbortController / signal usage for client disconnect

Fastify v5 exposes `req.signal` (a `AbortSignal`) that aborts when the HTTP request closes. Pass this directly to `llmProvider.stream(prompt, req.signal)`. The underlying `fetch` call in `BaseStreamProvider` is already wired to `signal`, so a client disconnect automatically cancels the LLM call.

### Existing `llmProviderFactory` — do NOT reconstruct

`api/src/services/llmProvider.ts` exports `llmProviderFactory(env)` which returns an `LLMProvider` with `stream()`. Call it once per request in the stream handler. Do not cache the provider instance at module scope in this story (Story 4.3 concern noted in deferred-work.md).

### AnalysisOutputSchema field: `nextSteps` min(1)

Story 4.5 AC says: "LLM returns a `complete` payload with no recommended steps → validation fails → `event: error`". The `min(1)` on `nextSteps` satisfies this. Keep it here.

### Test mock pattern for SSE routes

The SSE route uses `reply.raw` directly. To test it with `app.inject()`:

```typescript
const res = await app.inject({
  method: 'GET',
  url: `/api/v1/analysis-jobs/${jobId}/stream`,
  headers: { cookie: makeAuthCookie(app) },
})
// res.body is the full SSE text after stream completes
expect(res.headers['content-type']).toContain('text/event-stream')
const events = parseSSE(res.body) // helper function — see below
```

SSE parser helper for tests:
```typescript
function parseSSE(body: string): Array<{ event: string; data: unknown }> {
  return body.split('\n\n')
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
```

### Mock patterns for Redis in unit tests

Mock the `redis` module in tests the same way `scrubService.test.ts` mocks fetch:

```typescript
const { mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}))

vi.mock('../services/redisClient.js', () => ({
  redis: { get: mockRedisGet, set: mockRedisSet },
}))
```

And mock `scrubCache.get` to return scrubbed text:
```typescript
vi.mock('../services/scrubCache.js', () => ({
  get: vi.fn().mockResolvedValue('scrubbed log content'),
}))
```

### `req.user` shape

From `auth.ts` plugin, `req.user` is `{ id: number, username: string }` (set via `app.addHook('preHandler', app.authenticate)` / `app.authenticate` in `onRequest`). Cast with `(req.user as { id: number; username: string }).id`.

### `env.ts` — no changes needed

`SESSION_TTL_SECONDS` is already defined. No new env vars for this story.

### Files to create / modify

| File | Change |
|------|--------|
| `api/src/routes/analysis.ts` | REPLACE POST handler body; ADD GET /:id/stream route |
| `api/src/services/analysisOutputSchema.ts` | NEW — Zod schema + parse helper |
| `api/src/services/analysisOutputSchema.test.ts` | NEW — Zod unit tests |
| `api/src/routes/analysis.test.ts` | REPLACE — expand from 3 tests to ~10 |

No changes to: `app.ts`, `env.ts`, `schema.ts`, `llmProvider.ts`, `scrubCache.ts`.

### References

- [Source: epics.md — Story 4.3 AC and Test Scenarios]
- [Source: architecture.md — LLM Provider Interface, SSE wire format, pipeline state machine, async cancellation]
- [Source: architecture.md — Data exchange format: errors, anomalies, rootCause, timeline, recommendations]
- [Source: api/src/routes/analysis.ts — current stub to replace]
- [Source: api/src/services/llmProvider.ts — LLMProvider interface, factory]
- [Source: api/src/services/scrubCache.ts — Redis key pattern, get/set usage]
- [Source: api/src/services/redisClient.ts — redis singleton import]
- [Source: api/src/routes/logs.ts — route auth pattern, req.user cast]
- [Source: deferred-work.md — D2: provider factory instantiated per-request, per-request is fine for now]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

### 2026-04-30 — Chunked Analysis for Large Logs

**Problem:** Logs exceeding the LLM model's context window (gpt-5.4-mini: 400K tokens) were failing with 400 errors. Initial fix was truncation, but this lost data.

**Solution:** Replaced truncation with chunked analysis:
- `MAX_CHUNK_CHARS = 1,570,000` (400K tokens - 8K prompt overhead ≈ 392K tokens ≈ 1.57M chars at ~4 chars/token)
- `splitLogIntoChunks(text, maxChars)` — splits at newline boundaries within the last 10% of each chunk
- `buildChunkPrompt(text, chunkIndex, totalChunks)` — per-chunk analysis prompt
- `buildMergePrompt(partialResults[])` — merge prompt that combines errors (sum counts), de-duplicates anomalies, picks best rootCause, sorts timeline, merges nextSteps
- SSE `event: progress` messages with `{ stage: 'analysing'|'merging', totalChunks, currentChunk }`
- Single-chunk fast path when log fits in one chunk (most common case)

**Tests added:**
- "emits progress event at the start of single-chunk analysis"
- "splits large logs into multiple chunks and emits merge progress" (expects N+1 LLM calls: N chunks + merge)

### 2026-04-30 — Model Parameter Fix

**Problem:** `OpenAIProvider` and `OpenAICompatibleProvider` constructors weren't passing `model` to `super(BaseStreamProvider)`, causing `this.model` to be `undefined` and the error "you must provide a model parameter".

**Fix:** Both constructors now call `super(apiKey, baseUrl, model)`. Factory passes `env.LLM_MODEL` (default: `gpt-5.4-mini`).

**Tests added:**
- "sends the configured model in the request body"
- "sends the default model when LLM_MODEL is not set"
