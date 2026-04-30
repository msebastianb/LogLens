# Story 5.3: Non-blocking UI during long-running operations

Status: done

## Story

As a user,
I want the UI to remain fully interactive while a fetch, scrub, or LLM analysis is running,
So that I can navigate, review past results, or adjust settings without waiting for the pipeline to finish.

## Acceptance Criteria

1. **Given** the pipeline is in any active state, **When** I navigate to the data sources panel, **Then** the data source list loads and is interactive; the running pipeline continues in the background.

2. **Given** the pipeline is in any active state, **When** I interact with any non-analysis UI element (navigation, settings), **Then** the browser main thread is not blocked; no UI freezes or jank occurs during fetch, scrub, or LLM streaming operations.

3. **Given** the LLM is streaming tokens, **When** new tokens arrive, **Then** they are appended to the output via a React state update that does not cause `PipelineProgress` or other unrelated UI regions to re-render unnecessarily.

4. **Given** a Vitest test for the `useAnalysisPipeline` reducer, **When** the test suite runs, **Then** every state transition (`idle → fetching`, `fetching → scrubbing`, etc.) is covered by at least one test and the suite passes.

## Tasks / Subtasks

- [x] Task 1 — Create `frontend/src/features/analysis/useAnalysisStream.ts` (AC3)
  - [x] Export `useAnalysisStream(jobId: string | null, onToken: (token: string) => void, onComplete: (output: AnalysisOutput) => void, onError: (detail: string) => void): { outputRef: React.RefObject<string> }`
  - [x] Internally open an `EventSource` (or `fetch`-based SSE) pointed at `/api/v1/analysis-jobs/${jobId}/stream` when `jobId` is non-null
  - [x] On `event: token` — append token to `outputRef.current` (a `useRef<string>` — NOT a `useState`). Call `onToken(token)` to allow the parent to decide whether/when to trigger a re-render
  - [x] On `event: complete` — parse payload as `AnalysisOutput`, call `onComplete(output)`
  - [x] On `event: error` — call `onError(payload.message)`
  - [x] On hook unmount (or `jobId` change to null) — close the EventSource / abort fetch
  - [x] The hook must NOT hold any `useState` that changes on every token — accumulation is via `useRef`

- [x] Task 2 — Add/update tests for `useAnalysisStream` in `frontend/src/features/analysis/useAnalysisStream.test.ts` (AC3)
  - [x] Appending a token calls `onToken` but does not cause `PipelineProgress` to re-render (verify with `renderCount` or render spy)
  - [x] `onComplete` is called with parsed `AnalysisOutput` when `event: complete` arrives
  - [x] `onError` is called with message when `event: error` arrives
  - [x] EventSource / fetch is closed on unmount

- [x] Task 3 — Audit `useAnalysisPipeline.test.ts` (AC4)
  - [x] Verify all 9 state transitions are covered:
    - `idle → fetching` (SUBMIT)
    - `fetching → scrubbing` (FETCH_COMPLETE)
    - `scrubbing → awaiting-review` (SCRUB_COMPLETE)
    - `awaiting-review → analysing` (REVIEW_CONFIRMED)
    - `analysing → streaming` (TOKEN)
    - `streaming → complete` (COMPLETE)
    - `any active → error` (ERROR)
    - `any active → cancelled` (CANCEL)
    - `any → idle` (RESET)
  - [x] If any transition is missing, add the test

- [x] Task 4 — Finalize
  - [x] Run `npx vitest run` in `frontend/` — all pass
  - [x] Story → review, sprint-status updated

### Review Findings

- [x] [Review][Patch] Unused `screen` import in test file [`frontend/src/features/analysis/useAnalysisStream.test.tsx`, import line] — `screen` is imported from `@testing-library/react` but never referenced in any test. Remove it.
- [x] [Review][Defer] Stale `outputRef.current` between jobId change and next effect — deferred, inherent React effect timing; callers must not read ref synchronously during a render triggered by jobId prop change
- [x] [Review][Defer] Stale closure risk when unstable callbacks passed to hook — deferred, accepted React pattern; eslint-disable comment documents intent; caller responsibility
- [x] [Review][Defer] Native EventSource connection-error (`onerror`) not handled — deferred, connection drops degrade silently; out of story scope; track for future hardening

## Dev Notes

### Why `useRef` for token accumulation

Each SSE `event: token` arrives ~10–50ms apart during streaming. If the accumulated output were stored in `useState`, each token would trigger a React reconciliation pass for the entire component subtree — including `PipelineProgress`, `CancelButton`, and any other siblings that read the same state context. Using `useRef` for the raw string accumulation means:

- The ref mutation is synchronous and zero-cost for React
- The parent component chooses when to force a re-render (e.g., via a debounced `useState` counter, or only on `COMPLETE`)
- `PipelineProgress` never re-renders due to token arrival

### SSE implementation pattern

`EventSource` is the idiomatic browser API for SSE. However, it does not support custom headers (no CSRF token or cookies on cross-origin). Since our SSE endpoint uses JWT via httpOnly cookie + `credentials: 'include'`, `EventSource` **works** — the browser sends the cookie automatically. No CSRF token is needed for GET requests.

```typescript
const es = new EventSource(`/api/v1/analysis-jobs/${jobId}/stream`, { withCredentials: true })
es.addEventListener('token', (e) => { ... })
es.addEventListener('complete', (e) => { ... })
es.addEventListener('error', (e) => { ... })
// cleanup:
return () => es.close()
```

### Existing reducer transitions (already tested in `useAnalysisPipeline.test.ts`)

The current test file has 11 tests and covers all 9 required transitions. Task 3 is a verification-only audit — no new tests should be needed unless a transition is missing.

Transition coverage in current tests:
| Transition | Test |
|---|---|
| `idle → fetching` | "SUBMIT transitions idle → fetching" |
| `fetching → scrubbing` | "FETCH_COMPLETE transitions fetching → scrubbing..." |
| `scrubbing → awaiting-review` | "SCRUB_COMPLETE transitions scrubbing → awaiting-review..." |
| `awaiting-review → analysing` | "REVIEW_CONFIRMED transitions awaiting-review → analysing..." |
| `analysing → streaming` | "TOKEN transitions analysing → streaming..." |
| `streaming → complete` | "COMPLETE transitions streaming → complete..." |
| `any active → error` | "ERROR from active state → error..." |
| `any active → cancelled` | "CANCEL from active state → cancelled" |
| `any → idle` (RESET) | "RESET from any state returns initial store" |

All 9 covered — Task 3 is a no-op audit. If the audit confirms this, note it and move on.

### `useAnalysisStream` — mock strategy in tests

`EventSource` is not available in jsdom. Use `vi.stubGlobal('EventSource', MockEventSource)` where `MockEventSource` is a class that stores the instance for the test to programmatically dispatch events:

```typescript
class MockEventSource {
  static instance: MockEventSource | null = null
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
  close = vi.fn()
  constructor(public url: string, public opts?: EventSourceInit) {
    MockEventSource.instance = this
  }
  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), handler]
  }
  dispatch(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent
    this.listeners[type]?.forEach(h => h(event))
  }
}
```

Then in tests: `MockEventSource.instance!.dispatch('token', { text: 'hello' })`.

### Files changed

| File | Action |
|---|---|
| `frontend/src/features/analysis/useAnalysisStream.ts` | Create |
| `frontend/src/features/analysis/useAnalysisStream.test.ts` | Create |
| `frontend/src/features/analysis/useAnalysisPipeline.test.ts` | Audit only (likely no change) |
