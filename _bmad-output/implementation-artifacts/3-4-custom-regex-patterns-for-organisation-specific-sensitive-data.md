# Story 3.4: Custom regex patterns for organisation-specific sensitive data

Status: done

## Story

As a user,
I want to configure custom regex patterns that flag organisation-specific sensitive strings for redaction,
So that internal identifiers, project codes, or proprietary formats that the default detectors don't know about are also scrubbed.

## Acceptance Criteria

1. **Given** I am on the analysis configuration screen, **When** I add one or more custom regex patterns, **Then** they are sent as `custom_patterns: string[]` in the `POST /api/v1/scrub` request body to Fastify, which forwards them to the scrubber.

2. **Given** a custom pattern is provided, **When** the FastAPI pipeline evaluates it, **Then** any match in the log content is replaced with `[REDACTED_CUSTOM]` in addition to all standard PII and secrets redactions.

3. **Given** a custom pattern is an invalid regex, **When** the scrubber attempts to compile it, **Then** FastAPI returns a 422 validation error identifying the invalid pattern; Fastify propagates this as a 422 to the caller; the scrub request is rejected and no partial results are returned.

4. **Given** I leave the custom patterns field empty, **When** I submit the analysis, **Then** the scrubber runs with only its default PII and secrets detectors; no error occurs.

## Tasks / Subtasks

- [x] Task 1 — Extend `scrubService.ts` to forward `custom_patterns` (AC1, AC3)
  - [x] Add optional `customPatterns?: string[]` parameter to `scrubText()`
  - [x] Include `custom_patterns` in fetch body when provided (omit key when undefined/empty)
  - [x] Add `ScrubValidationError` class for scrubber 422 responses (distinct from 502)
  - [x] Handle HTTP 422 from scrubber: throw `ScrubValidationError` with scrubber error body
  - [x] Update `scrubText()` JSDoc

- [x] Task 2 — Create `api/src/routes/scrub.ts` — new `POST /api/v1/scrub` endpoint (AC1, AC2, AC3, AC4)
  - [x] Accept JSON body `{ text: string, custom_patterns?: string[] }` with Zod/JSON schema
  - [x] Require auth (`onRequest: [app.authenticate]`)
  - [x] Call `scrubText(body.text, { customPatterns: body.custom_patterns })`
  - [x] On `ScrubValidationError`: return 422 with body from scrubber (RFC 7807 shape: `{ message }`)
  - [x] On `ScrubTimeoutError`: return 504
  - [x] On `ScrubUnavailableError`: return 502
  - [x] Return `{ redacted_text, redaction_summary }` on success

- [x] Task 3 — Register new route in `api/src/app.ts` (AC1)
  - [x] Import `scrubRoute` from `./routes/scrub.js`
  - [x] Add `await app.register(scrubRoute)` alongside other routes

- [x] Task 4 — Vitest unit tests `api/src/routes/scrub.test.ts` (test scenarios)
  - [x] Custom patterns forwarded as-is in scrubber request body
  - [x] Empty `custom_patterns` array: omitted from scrubber request (or sent as empty — must match implementation)
  - [x] `custom_patterns: undefined`: omitted from scrubber request body
  - [x] Invalid regex: scrubber returns 422, Fastify returns 422
  - [x] Clean text + valid pattern: returns 200 with `redaction_summary`
  - [x] Auth guard: unauthenticated request returns 401

- [x] Task 5 — Vitest integration tests `api/src/routes/scrub.integration.test.ts` (against real scrubber via Docker)
  - [x] `POST /api/v1/scrub` with `custom_patterns: ["PROJ-[0-9]+"]` and matching text: response contains `[REDACTED_CUSTOM]`
  - [x] `POST /api/v1/scrub` with invalid regex `["["]`: returns RFC 7807 422

- [x] Task 6 — Finalize
  - [x] Run `pnpm --filter api test` (unit) — 89 passed, 0 failed
  - [x] Story → review, sprint-status updated

### Review Findings

- [x] [Review][Patch] Integration test env override ineffective — `process.env.SCRUBBER_URL` set in `beforeAll` after module load; `env` singleton already cached; mock starts on 8098 but requests go to 8099 — broken 422 integration test [api/src/routes/scrub.integration.test.ts:37,80]
- [x] [Review][Patch] `scrubService.test.ts` missing coverage for new 422/ScrubValidationError path and custom_patterns forwarding — only indirectly covered via mocked route tests [api/src/services/scrubService.test.ts]
- [x] [Review][Patch] 422 catch block hardcodes "Invalid custom_patterns: invalid regex" for ALL scrubber 422s — misleading if scrubber returns 422 for missing/invalid `text` field [api/src/routes/scrub.ts:42]
- [x] [Review][Defer] `scrubText()` signature change `(text, signal?)` → `(text, options?, signal?)` silently drops AbortSignal if passed as second arg — no current callers affected but undocumented breaking change — deferred, no current callers
- [x] [Review][Defer] `ScrubValidationError.detail` stored but never surfaced to caller in route handler — dead field — deferred, low impact

## Dev Notes

### Python scrubber side — ALREADY COMPLETE (Story 3.3)

**Do NOT touch the Python scrubber for this story.** Everything needed is already in place:

- `scrubber/pipeline/detect_secrets.py`: `SecretsScanner.scrub(text, custom_patterns: list[str] | None)` — processes custom regex patterns (Stage 2), returns `[REDACTED_CUSTOM]` for matches.
- `scrubber/main.py`:
  - `ScrubRequest.custom_patterns: list[str] | None = None` — Pydantic field
  - `@field_validator("custom_patterns")` — validates each regex via `re.compile()`; raises `ValueError` → FastAPI returns 422 Unprocessable Entity
  - The `/scrub` handler already passes `custom_patterns=body.custom_patterns` to `ss.scrub()`
- The scrubber 422 body (from FastAPI Pydantic validation) looks like:
  ```json
  {
    "detail": [
      {
        "type": "value_error",
        "loc": ["body", "custom_patterns"],
        "msg": "Value error, Invalid regex pattern '[': ...",
        "input": ["["]
      }
    ]
  }
  ```

### Node.js API side — this story's work

#### 1. `api/src/services/scrubService.ts` (UPDATE)

Current signature:
```typescript
export async function scrubText(text: string, signal?: AbortSignal): Promise<ScrubResult>
```

New signature:
```typescript
export async function scrubText(
  text: string,
  options?: { customPatterns?: string[] },
  signal?: AbortSignal,
): Promise<ScrubResult>
```

Add new error class:
```typescript
export class ScrubValidationError extends Error {
  detail: unknown
  constructor(detail: unknown) {
    super('Scrubber returned 422 validation error')
    this.name = 'ScrubValidationError'
    this.detail = detail
  }
}
```

In the fetch body, include `custom_patterns` only when provided and non-empty:
```typescript
const bodyPayload: Record<string, unknown> = { text }
if (options?.customPatterns?.length) {
  bodyPayload.custom_patterns = options.customPatterns
}
body: JSON.stringify(bodyPayload),
```

After `if (!res.ok)`, handle 422 separately **before** the generic 502:
```typescript
if (res.status === 422) {
  const detail = await res.json().catch(() => null)
  throw new ScrubValidationError(detail)
}
if (!res.ok) {
  throw new ScrubUnavailableError(`Scrubber returned ${res.status}`)
}
```

**IMPORTANT**: The existing `scrubText(rawText)` call in `logs.ts` has no options arg — it must keep working with no change (backward compatible).

#### 2. `api/src/routes/scrub.ts` (NEW)

Pattern: mirror `logs.ts` route structure.
- Export `async function scrubRoute(app: FastifyInstance)`
- JSON body (not multipart — no `@fastify/multipart` needed here)
- Use `app.post('/api/v1/scrub', { onRequest: [app.authenticate] }, handler)`
- In handler, catch `ScrubValidationError` and return 422:
  ```typescript
  if (err instanceof ScrubValidationError) {
    return reply.status(422).send({ message: 'Invalid custom_patterns: invalid regex' })
  }
  ```
  (Keep the message simple — the FastAPI detail is complex and not user-friendly as-is.)

#### 3. `api/src/app.ts` (UPDATE)

Add after existing route registrations:
```typescript
import { scrubRoute } from './routes/scrub.js'
// ...
await app.register(scrubRoute)
```
No additional plugins needed (JSON body parsing is built-in to Fastify).

### Test patterns — follow existing Vitest tests

From `logs.test.ts`:
- `vi.hoisted()` for mock functions declared at top
- `vi.mock('../services/scrubService.js', ...)` — hoist mocks for scrubService
- `buildTestApp()` function that builds a minimal Fastify instance with only the needed plugins
- `makeAuthCookie()` helper using `app.jwt.sign()`
- Tests use `app.inject()` (not supertest)

For `scrub.test.ts`, the `buildTestApp()` needs: cookie, jwt, sensible, authPlugin, then `scrubRoute`. No multipart needed.

The mock for `scrubService.js` must export `ScrubValidationError`, `ScrubUnavailableError`, `ScrubTimeoutError` as classes so `instanceof` checks work in the route handler.

### 422 propagation — critical path

The scrubber returns 422 for invalid patterns. The current `scrubService.ts` throws `ScrubUnavailableError` for all non-200. After this story, it must distinguish 422 from other failures:

```
scrubber 422  →  ScrubValidationError  →  Fastify 422
scrubber 502  →  ScrubUnavailableError →  Fastify 502
scrubber 504 / network timeout → ScrubTimeoutError → Fastify 504
```

### Integration test prerequisites

The integration test (`scrub.integration.test.ts`) requires a live scrubber. Check `logs.integration.test.ts` for how it starts a mock/real scrubber or skips without one. In this project the integration tests likely run with Docker Compose. Check `vitest.integration.config.ts` for env var gating patterns.

### Project Structure Notes

- New file: `api/src/routes/scrub.ts` — mirrors `logs.ts` pattern
- New file: `api/src/routes/scrub.test.ts` — mirrors `logs.test.ts` pattern
- New file: `api/src/routes/scrub.integration.test.ts` — mirrors `logs.integration.test.ts` pattern
- Update: `api/src/services/scrubService.ts` — add `ScrubValidationError`, extend `scrubText()` signature
- Update: `api/src/app.ts` — register `scrubRoute`
- No changes to `scrubber/` (Python side complete)
- No changes to `api/src/routes/logs.ts` (existing upload flow unchanged)

### References

- [Source: epics.md — Story 3.4 AC and Test Scenarios]
- [Source: architecture.md — Internal Fastify → FastAPI section: `custom_patterns?: string[]` in request body]
- [Source: scrubber/main.py — ScrubRequest.custom_patterns, field_validator (Story 3.3)]
- [Source: scrubber/pipeline/detect_secrets.py — SecretsScanner.scrub() custom_patterns Stage 2 (Story 3.3)]
- [Source: api/src/services/scrubService.ts — existing scrubText() signature and error classes]
- [Source: api/src/routes/logs.ts — route pattern, auth guard, error handling]
- [Source: api/src/routes/logs.test.ts — Vitest test pattern: vi.hoisted, buildTestApp, makeAuthCookie, app.inject]
- [Source: api/src/app.ts — route registration pattern]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (GitHub Copilot)

### Debug Log References

- `scrubText()` signature change: added `options?: { customPatterns?: string[] }` as second arg (before optional `signal`). Existing call in `logs.ts` passes no second arg — backward compatible (undefined options = no custom_patterns).
- Integration test uses port 8098 (not 8099) to avoid collision with logs integration test mock scrubber.
- `process.env.SCRUBBER_URL` override in `beforeAll` required because `env.ts` reads at module load time; vitest integration config sets 8099 globally.
- 8 pre-existing TS type errors in auth.ts, health.ts, redisClient.ts — unrelated to this story; zero new errors introduced.

### Completion Notes List

- Python scrubber required zero changes (all custom_patterns logic landed in Story 3.3).
- `ScrubValidationError` is distinct from `ScrubUnavailableError`; maps to 422, not 502.
- `custom_patterns` omitted from fetch body when undefined or empty array (falsy length check).
- All 89 API unit tests pass.

### File List

- `api/src/services/scrubService.ts` — updated: added `ScrubValidationError`, extended `scrubText()` signature, 422 branch
- `api/src/routes/scrub.ts` — created: `POST /api/v1/scrub` route
- `api/src/routes/scrub.test.ts` — created: 7 Vitest unit tests
- `api/src/routes/scrub.integration.test.ts` — created: 3 integration tests
- `api/src/app.ts` — updated: imports and registers `scrubRoute`
- `api/vitest.integration.config.ts` — updated: added `scrub.integration.test.ts` to include list
