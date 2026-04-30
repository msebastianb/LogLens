# Story 5.2: In-flight analysis cancellation

Status: done

## Story

As a user,
I want to cancel an analysis that is currently running,
So that I can abort a long-running or unwanted operation and start fresh without waiting for it to complete.

## Acceptance Criteria

1. **Given** the pipeline is in any active state (`fetching`, `scrubbing`, `analysing`, `streaming`), **When** a "Cancel" button is visible and I click it, **Then** the UI sends `DELETE /api/v1/analysis-jobs/:id` to Fastify.

2. **Given** Fastify receives the cancel request, **When** it is processed, **Then** the AbortController signal for the job is triggered (cancelling any in-flight LLM stream), and the Redis scrub-cache key for the job's `cacheId` is deleted.

3. **Given** cancellation completes, **When** the pipeline state updates, **Then** the state transitions to `cancelled`, the progress indicator reflects this, and the "Cancel" button is replaced with a "Start New Analysis" button.

4. **Given** the pipeline is in `idle`, `awaiting-review`, or `complete` state, **When** the UI renders, **Then** no "Cancel" button is shown.

5. **Given** a cancel request arrives after the job has already completed, **When** Fastify processes it, **Then** it returns 204 No Content (idempotent); no error is raised.

## Tasks / Subtasks

- [x] Task 1 — Add `del` function to `api/src/services/scrubCache.ts`
  - [x] Export `async function del(userId: number, cacheId: string): Promise<void>` — calls `redis.del(\`scrub_cache:${userId}:${cacheId}\`)`

- [x] Task 2 — Add per-job `AbortController` registry to `api/src/routes/analysis.ts` (AC2)
  - [x] Add module-level `Map<string, AbortController>`: `const jobControllers = new Map<string, AbortController>()`
  - [x] In `POST /api/v1/analysis-jobs`: create an `AbortController` for the job and store in `jobControllers` keyed by `jobId`
  - [x] In `GET /api/v1/analysis-jobs/:id/stream`: retrieve the controller for the job and pass `controller.signal` to `provider.stream()` instead of `req.signal`; after stream ends (success, error, or client disconnect), call `jobControllers.delete(jobId)`
  - [x] In `DELETE /api/v1/analysis-jobs/:id`:
    - [x] Auth required (`onRequest: [app.authenticate]`)
    - [x] Look up job in Redis `analysis_job:{id}` — 404 if not found
    - [x] Verify ownership (`job.userId === userId`) — 403 if mismatch
    - [x] If job is already `complete` or `error` → return 204 (idempotent; AC5)
    - [x] Call `controller.abort()` if controller exists in `jobControllers`
    - [x] Call `scrubCache.del(userId, job.cacheId)` to remove scrub cache entry
    - [x] Update job status in Redis to `cancelled`
    - [x] Return 204 No Content
  - [x] Export `jobControllers` for use in tests (allows test to inject controllers)

- [x] Task 3 — Update `api/src/routes/analysis.test.ts` (AC2, AC5)
  - [x] `DELETE /api/v1/analysis-jobs/:id`: returns 401 without auth
  - [x] `DELETE /api/v1/analysis-jobs/:id`: returns 404 when job not found
  - [x] `DELETE /api/v1/analysis-jobs/:id`: returns 403 when userId mismatch
  - [x] `DELETE /api/v1/analysis-jobs/:id`: calls `controller.abort()` and `scrubCache.del()` for in-progress job; returns 204
  - [x] `DELETE /api/v1/analysis-jobs/:id`: returns 204 without calling abort when job is already complete (idempotent)
  - [x] Update `api/src/services/scrubCache.test.ts` — add test for `del()`

- [x] Task 4 — Create `frontend/src/features/analysis/CancelButton.tsx` (AC1, AC3, AC4)
  - [x] Accept props: `{ jobId: string | null; store: PipelineStore; onCancel: () => void }`
  - [x] Show "Cancel" button only when `store.state` is in `['fetching', 'scrubbing', 'analysing', 'streaming']`
  - [x] On click: call `fetch(\`/api/v1/analysis-jobs/${jobId}\`, { method: 'DELETE', credentials: 'include' })` then call `onCancel()` (which dispatches `CANCEL` to pipeline reducer)
  - [x] When `store.state === 'cancelled'`: show "Start New Analysis" button that calls `onCancel()` (which dispatches `RESET`)
  - [x] When `store.state` is `idle`, `awaiting-review`, or `complete`: render nothing

- [x] Task 5 — Create `frontend/src/features/analysis/CancelButton.test.tsx` (AC1, AC3, AC4)
  - [x] does not render when state is `idle`
  - [x] does not render when state is `awaiting-review`
  - [x] does not render when state is `complete`
  - [x] renders "Cancel" button when state is `fetching`
  - [x] renders "Cancel" button when state is `analysing`
  - [x] clicking "Cancel" calls `fetch` DELETE and then `onCancel`
  - [x] renders "Start New Analysis" button when state is `cancelled`
  - [x] clicking "Start New Analysis" calls `onCancel`

- [x] Task 6 — Finalize
  - [x] Run `pnpm test` in `api/` — all pass
  - [x] Run `npx vitest run` in `frontend/` — all pass
  - [x] Story → review, sprint-status updated

### Review Findings

- [x] [Review][Patch] GET stream overwrites `cancelled` with `error` in Redis after abort [`api/src/routes/analysis.ts`, GET route catch block] — when the LLM stream is aborted via `controller.abort()`, the catch block catches the AbortError, sets `finalStatus = 'error'`, and the finally block then writes `{ status: 'error' }` to Redis — overwriting the `'cancelled'` status just set by the DELETE handler. Fix: detect AbortError in the catch block and skip the Redis status update (or preserve `'cancelled'` status).
- [x] [Review][Patch] `handleCancel` early-returns without calling `onCancel()` when `jobId` is null [`frontend/src/features/analysis/CancelButton.tsx`, `handleCancel`] — in `fetching`/`scrubbing` states, `jobId` is null. `if (!jobId) return` exits without calling `onCancel()`, leaving the pipeline stuck with no UI transition. Fix: call `onCancel()` before or regardless of the null guard so the UI can always dispatch `CANCEL`.
- [x] [Review][Defer] AbortController leaks in `jobControllers` Map if `redis.set` fails in POST [`api/src/routes/analysis.ts`, POST handler] — deferred, pre-existing infrastructure failure path; no client ever receives the jobId so the leak is unreachable

## Dev Notes

### Per-job AbortController registry — module-level Map

The GET stream route and the DELETE cancel route are separate HTTP requests. `req.signal` on the GET only aborts on client disconnect — it cannot be triggered by the DELETE handler. Solution: a module-level `Map<string, AbortController>` keyed by `jobId`.

```typescript
// In analysis.ts — at module level
export const jobControllers = new Map<string, AbortController>()
```

In `POST /api/v1/analysis-jobs`:
```typescript
const controller = new AbortController()
jobControllers.set(jobId, controller)
// store job in Redis...
return reply.status(201).send({ jobId })
```

In `GET /api/v1/analysis-jobs/:id/stream`:
```typescript
const controller = jobControllers.get(jobId)
// fall back to a new controller if missing (e.g. server restart)
const signal = controller?.signal ?? req.signal

// ...after stream ends (in finally):
jobControllers.delete(jobId)
```

In `DELETE /api/v1/analysis-jobs/:id`:
```typescript
const controller = jobControllers.get(jobId)
controller?.abort()
jobControllers.delete(jobId)
```

Exported so tests can inject a mock controller before calling the route.

### `AnalysisJob` type — add `cancelled` status

The existing `AnalysisJob` interface in `analysis.ts` only has `'pending' | 'complete' | 'error'`. Add `'cancelled'`:

```typescript
interface AnalysisJob {
  status: 'pending' | 'complete' | 'error' | 'cancelled'
  userId: number
  cacheId: string
  createdAt: string
}
```

### `scrubCache.del` — simple single-key delete

```typescript
export async function del(userId: number, cacheId: string): Promise<void> {
  await redis.del(`scrub_cache:${userId}:${cacheId}`)
}
```

Add below the existing `get` function. No change to `set`, `get`, `deleteAll`.

### DELETE route — idempotent for complete/error jobs

```typescript
app.delete<{ Params: { id: string } }>(
  '/api/v1/analysis-jobs/:id',
  { onRequest: [app.authenticate] },
  async (req, reply) => {
    const userId = (req.user as { id: number }).id
    const { id: jobId } = req.params

    const raw = await redis.get(jobKey(jobId))
    if (!raw) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Analysis job not found or expired' })

    const job = JSON.parse(raw) as AnalysisJob
    if (job.userId !== userId) return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You do not have access to this analysis job' })

    // Idempotent — already terminal
    if (job.status === 'complete' || job.status === 'error' || job.status === 'cancelled') {
      return reply.status(204).send()
    }

    // Abort in-flight operations
    const controller = jobControllers.get(jobId)
    controller?.abort()
    jobControllers.delete(jobId)

    // Delete scrub cache entry
    await scrubCache.del(userId, job.cacheId)

    // Update job status
    const updatedJob: AnalysisJob = { ...job, status: 'cancelled' }
    await redis.set(jobKey(jobId), JSON.stringify(updatedJob), 'EX', env.SESSION_TTL_SECONDS)

    return reply.status(204).send()
  },
)
```

### `CancelButton.tsx` — fetch pattern

The cancel button needs the CSRF token for the DELETE request. Use the same `apiGet` + custom fetch pattern as `uploadLogFile`. However, since DELETE is a state-mutating operation, CSRF protection applies. Check if the CSRF middleware exempts DELETE or requires the token header.

Looking at the existing CSRF implementation: the CSRF plugin validates `x-csrf-token` header on non-GET, non-HEAD requests. So DELETE requires the token.

Simplest approach — re-use the `fetchCsrfToken()` helper from `analysisApi.ts` (or extract it to a shared utility). Since both files are in the same feature folder, import from `analysisApi.ts`:

```typescript
// In CancelButton.tsx — import the internal token helper
// OR just inline the same pattern:
async function cancelJob(jobId: string): Promise<void> {
  const csrfRes = await fetch('/api/v1/csrf/token', { credentials: 'include' })
  const { token } = await csrfRes.json() as { token: string }
  await fetch(`/api/v1/analysis-jobs/${jobId}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': token },
    credentials: 'include',
  })
}
```

### `CancelButton` test — mock fetch

```typescript
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))
vi.stubGlobal('fetch', mockFetch)
```

Mock CSRF token response + DELETE response:
```typescript
mockFetch
  .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'test-token' }) })
  .mockResolvedValueOnce({ ok: true })
```

### `useAnalysisPipeline` CANCEL already tested — no new reducer tests

Story 5.1 already has reducer tests for `CANCEL`. No duplication needed.

### Files to create / modify

| File | Change |
|------|--------|
| `api/src/services/scrubCache.ts` | Add `del(userId, cacheId)` function |
| `api/src/services/scrubCache.test.ts` | Add test for `del()` |
| `api/src/routes/analysis.ts` | Add `jobControllers` Map; update POST to store controller; update GET to use controller signal; add DELETE route |
| `api/src/routes/analysis.test.ts` | Add 5 tests for DELETE route |
| `frontend/src/features/analysis/CancelButton.tsx` | NEW — cancel/restart button component |
| `frontend/src/features/analysis/CancelButton.test.tsx` | NEW — 8 tests |

No changes to: `useAnalysisPipeline.ts` (CANCEL already implemented), `PipelineProgress.tsx`, `AnalysisOutput.tsx`, `env.ts`.

### References

- [Source: epics.md — Story 5.2 AC and Test Scenarios]
- [Source: architecture.md — Async Cancellation: AbortController signal passed to all async ops]
- [Source: api/src/routes/analysis.ts — existing POST + GET SSE routes]
- [Source: api/src/services/scrubCache.ts — existing set/get/deleteAll functions]
- [Source: api/src/routes/analysis.test.ts — existing mock pattern for Redis, scrubCache, llmProvider]
- [Source: frontend/src/features/analysis/analysisApi.ts — fetchCsrfToken pattern]
- [Source: frontend/src/features/analysis/useAnalysisPipeline.ts — CANCEL action already implemented]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
