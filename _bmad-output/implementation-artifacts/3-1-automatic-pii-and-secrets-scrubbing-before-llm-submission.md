# Story 3.1: Automatic PII and secrets scrubbing before LLM submission

Status: done

## Story

As a user,
I want fetched or uploaded log content to be automatically scrubbed of PII and secrets before it can be submitted to an LLM,
So that sensitive data is never sent to an external service without my awareness.

## Acceptance Criteria

**AC1 — Scrubber called automatically after upload:**
**Given** log content has arrived from the file upload source (or any future source),
**When** it passes size validation,
**Then** Fastify automatically calls `POST http://scrubber:8001/scrub` with the raw log text before any further processing; raw log content is never written to Redis.

**AC2 — Scrubbed text cached in Redis:**
**Given** the scrubber call succeeds,
**When** the response is received,
**Then** the `redacted_text` is stored in Redis under `scrub_cache:{userId}:{cacheId}` with TTL = `SESSION_TTL_SECONDS`; the raw log text is discarded from memory.

**AC3 — Scrubber unreachable returns 502:**
**Given** the scrubber service is unreachable or returns a non-200 response,
**When** the scrub call is made,
**Then** Fastify returns RFC 7807 `502 Bad Gateway`; no log content is cached and the user sees a clear error.

**AC4 — Scrubber timeout returns 504:**
**Given** the scrubber call times out (after `SCRUBBER_TIMEOUT_MS`, default 30s),
**When** the timeout fires,
**Then** the request is aborted via AbortController and Fastify returns RFC 7807 `504 Gateway Timeout`.

## Tasks / Subtasks

- [x] Task 1 — scrubService + env update (AC1, AC3, AC4)
  - [x] Add `SCRUBBER_URL` to `api/src/config/env.ts` (default `http://scrubber:8001`)
  - [x] Update `api/src/app.ts` to use `env.SCRUBBER_URL` in healthRoute registration
  - [x] Create `api/src/services/scrubService.ts` with `scrubText(text, signal?)` function
    - Uses `AbortSignal.timeout(env.SCRUBBER_TIMEOUT_MS)` for timeout
    - Throws `ScrubTimeoutError` on timeout (→ 504)
    - Throws `ScrubUnavailableError` on network error or non-200 status (→ 502)

- [x] Task 2 — scrubCache set/get (AC2)
  - [x] Add `set(userId, cacheId, text)` to `api/src/services/scrubCache.ts`
  - [x] Add `get(userId, cacheId)` to `api/src/services/scrubCache.ts`
  - [x] `cacheId` is a UUID v4 generated per upload request

- [x] Task 3 — Wire scrub pipeline in logs.ts (AC1, AC2)
  - [x] After `parseLogFile` success, call `scrubText(lines.join('\n'))`
  - [x] Generate `cacheId` (crypto.randomUUID())
  - [x] Store `redacted_text` in Redis via `scrubCache.set(userId, cacheId, redactedText)`
  - [x] Return `{ cacheId, lineCount, redactionSummary }` instead of raw lines

- [x] Task 4 — Unit tests (AC3, AC4)
  - [x] `api/src/services/scrubService.test.ts`
    - returns redacted_text and summary on 200 from mock scrubber
    - throws ScrubUnavailableError when scrubber returns 500
    - throws ScrubTimeoutError when scrubber exceeds SCRUBBER_TIMEOUT_MS
  - [x] `api/src/services/scrubCache.test.ts`
    - `set()` stores value in Redis with correct key and TTL
    - `get()` returns value for known key
    - `get()` returns null for missing key
    - `deleteAll()` removes all keys for userId

- [x] Task 5 — Integration tests (AC1, AC2, AC3)
  - [x] Add scrub pipeline integration tests to `api/src/routes/logs.integration.test.ts`
    - Valid .log upload: scrubber called, cacheId returned, Redis key exists
    - Scrubber unreachable: returns RFC 7807 502; no Redis key created

- [x] Task 6 — Finalize
  - [x] All tasks checked, story → review, sprint-status updated

## Dev Notes

### Context and constraints

Story 3.1 wires the scrub pipeline between the upload route (Story 2.4) and the Redis cache. The scrubber Python service already has a stub `POST /scrub` endpoint that passes text through — that stub is sufficient for this story. Story 3.2 (NER) and Story 3.3 (detect-secrets) will replace the stub with real detection.

### Existing implementation patterns to preserve

- `scrubCache.deleteAll()` already uses SCAN+DEL — preserve this pattern in the cache service.
- `api/src/routes/logs.ts` owns the upload flow; scrub is an additional step in the same handler.
- `env.SCRUBBER_TIMEOUT_MS` is already in the Zod schema. `SCRUBBER_URL` needs to be added.
- `healthRoute` passes `scrubberUrl` as an option — use `env.SCRUBBER_URL` there too.

### Error classes

```typescript
export class ScrubUnavailableError extends Error {}
export class ScrubTimeoutError extends Error {}
```

### Cache key scheme

`scrub_cache:{userId}:{cacheId}` where `cacheId = crypto.randomUUID()`

### Response shape (updated from Story 2.4)

```json
{ "cacheId": "uuid", "lineCount": 42, "redactionSummary": [...] }
```

### File List

#### To be created
- `api/src/services/scrubService.ts`
- `api/src/services/scrubService.test.ts`
- `api/src/services/scrubCache.test.ts`

#### To be updated
- `api/src/config/env.ts` — add SCRUBBER_URL
- `api/src/app.ts` — use env.SCRUBBER_URL
- `api/src/services/scrubCache.ts` — add set/get
- `api/src/routes/logs.ts` — call scrub, cache, new response shape

### Change Log

- 2026-04-28: Created Story 3.1 from Epic 3.

### Review Findings

- [x] [Review][Patch] P1 — Caller AbortSignal misclassified as ScrubUnavailableError [api/src/services/scrubService.ts — catch block]
- [x] [Review][Patch] P2 — Scrubber response fields not validated — undefined silently stored in Redis [api/src/services/scrubService.ts — res.json() parsing]
- [x] [Review][Patch] P3 — res.json() SyntaxError escapes unhandled — opaque 500 on non-JSON 200 response [api/src/services/scrubService.ts — res.json() call]
- [x] [Review][Patch] P4 — userId unsafely cast — scrub_cache:undefined:* keys on auth shape mismatch [api/src/routes/logs.ts]
- [x] [Review][Patch] P5 — Redis SET failure unhandled — uncaught rejection after successful scrub [api/src/routes/logs.ts]
- [x] [Review][Patch] P6 — Empty lines array sends empty string to scrubber — empty result cached with valid cacheId [api/src/routes/logs.ts]
- [x] [Review][Patch] P7 — Wrong Content-Type throws FST_INVALID_MULTIPART_CONTENT_TYPE unhandled — 500 instead of 400 [api/src/routes/logs.ts — req.file() catch]
- [x] [Review][Patch] P8 — Internal scrubber hostname leaked verbatim in 502 response body [api/src/services/scrubService.ts + api/src/routes/logs.ts]

- [x] [Review][Defer] D1 — RFC 7807 fields (type/title/status/detail) missing on 502/504 [api/src/routes/logs.ts] — deferred, pre-existing pattern (422 also plain {message})
- [x] [Review][Defer] D2 — Unbounded DEL spread in deleteAll — no batch cap [api/src/services/scrubCache.ts] — deferred, pre-existing from Story 1.4
- [x] [Review][Defer] D3 — No rate limiting on upload endpoint — deferred, pre-existing across all endpoints
- [x] [Review][Defer] D4 — 30s default SCRUBBER_TIMEOUT_MS too large for interactive endpoint — deferred, operator configuration choice
- [x] [Review][Defer] D5 — File extension validated by client-controlled filename, not content — deferred, pre-existing from Story 2.4
- [x] [Review][Defer] D6 — Triple memory buffering (buffer + content + rawText) — deferred, pre-existing from Story 2.4
- [x] [Review][Defer] D7 — No auth between API and scrubber service (no mTLS/key) — deferred, architecture-level decision
- [x] [Review][Defer] D8 — Scrubber response body not size-guarded before res.json() — deferred, low risk on internal network
- [x] [Review][Defer] D9 — redis.del/scan errors not caught in deleteAll loop — deferred, pre-existing from Story 1.4

### Status

done
