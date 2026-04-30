# Story 5.5: Analysis view and redaction review panel

Status: done

## Story

As a user,
I want to see the full analysis pipeline — upload, scrub review, LLM streaming, and structured output — in a single cohesive page,
so that I can confirm what was redacted before analysis starts and watch the results appear in real time.

## Acceptance Criteria

1. **Given** I navigate to `/analysis`, **When** the page loads, **Then** I see the file upload form (`FileUpload` component) and nothing else (pipeline is `idle`).

2. **Given** I submit a valid log file, **When** the upload+scrub API call succeeds, **Then** the pipeline transitions through `fetching → scrubbing → awaiting-review`, `PipelineProgress` becomes visible showing the completed stages, and a `RedactionReviewPanel` appears displaying the redaction summary with a **"Confirm analysis"** button.

3. **Given** the `RedactionReviewPanel` is visible, **When** I click "Confirm analysis", **Then** the pipeline transitions to `analysing`, `POST /api/v1/analysis-jobs` is called with the `cacheId`, and `PipelineProgress` reflects the analysing stage.

4. **Given** analysis is in progress, **When** SSE tokens arrive via `GET /api/v1/analysis-jobs/:id/stream`, **Then** the pipeline transitions to `streaming` and the `CancelButton` is visible.

5. **Given** the SSE stream emits `event: complete`, **When** the event is received, **Then** the pipeline transitions to `complete`, `AnalysisOutput` renders the structured result, and `CancelButton` shows "Start New Analysis".

6. **Given** I click "Start New Analysis" (or "Cancel" during active analysis), **When** the action completes, **Then** the pipeline resets to `idle` and the upload form is shown again.

7. **Given** the pipeline is in any active state, **When** the Playwright e2e tests run, **Then** all tests in `analysis.spec.ts` that reach the `awaiting-review` stage find a button matching `/confirm|approve|review/i`.

## Tasks / Subtasks

- [x] Task 1 — Create `frontend/src/features/analysis/RedactionReviewPanel.tsx` (AC2, AC7)
  - [x] Accept props: `{ redactionSummary: Array<{ type: string; start: number; end: number }>; onConfirm: () => void }`
  - [x] Render a summary of redactions: group by `type`, show count per type (e.g. "3 × PERSON, 1 × API_KEY")
  - [x] If `redactionSummary` is empty, show "No sensitive content detected."
  - [x] Render a `<button>` with text **"Confirm analysis"** that calls `onConfirm()` — this must match `/confirm/i`
  - [x] Add `role="region"` with `aria-label="Redaction review"` for accessibility

- [x] Task 2 — Create `frontend/src/features/analysis/AnalysisView.tsx` (AC1–AC6)
  - [x] This is the top-level orchestrator for the `/analysis` route; replaces `FileUpload` in `router.tsx`
  - [x] Use `useAnalysisPipeline()` for all state management
  - [x] Internal state: `cacheId: string | null`, `jobId: string | null`, `redactionSummary`, `analysisOutput: AnalysisOutput | null`, `streamOutput: string` (accumulated tokens for display)
  - [x] **Idle state**: render `<FileUpload onSubmitStart={...} onUploadComplete={...} />`
    - `onSubmitStart` → dispatch `SUBMIT` (pipeline `idle → fetching`)
    - `onUploadComplete(result)` → store `cacheId` + `redactionSummary`; dispatch `FETCH_COMPLETE` then `SCRUB_COMPLETE` (pipeline `fetching → scrubbing → awaiting-review`)
  - [x] **All non-idle states**: render `<PipelineProgress store={store} />` at the top
  - [x] **`awaiting-review` state**: render `<RedactionReviewPanel redactionSummary={...} onConfirm={handleConfirm} />`
    - `handleConfirm` → calls `POST /api/v1/analysis-jobs` with `{ cacheId }` → stores `jobId` → dispatches `REVIEW_CONFIRMED`
  - [x] **`analysing` / `streaming` / `complete` / `cancelled` / `error` states**: render `<CancelButton jobId={jobId} store={store} onCancel={handleCancel} />`
    - `handleCancel` → dispatches `CANCEL` or `RESET` (CancelButton already handles DELETE; just dispatch on callback)
  - [x] **`streaming` / `complete` states**: render streaming token output area (a `<pre>` or `<div>` for token accumulation) and `<AnalysisOutput output={analysisOutput} />` when `analysisOutput` is non-null
  - [x] Use `useAnalysisStream(jobId, onToken, onComplete, onError)`:
    - `onToken(text)` → append to `streamOutput`, dispatch `TOKEN`
    - `onComplete(output)` → store `analysisOutput`, dispatch `COMPLETE`
    - `onError(detail)` → dispatch `ERROR` with detail
  - [x] **Error state**: render error detail message below `PipelineProgress`
  - [x] **Reset flow**: `handleCancel` when state is `cancelled` or "Start New Analysis" is clicked → dispatch `RESET`, clear `cacheId`, `jobId`, `redactionSummary`, `analysisOutput`, `streamOutput`

- [x] Task 3 — Update `frontend/src/features/analysis/FileUpload.tsx` to accept optional orchestration callbacks (AC2)
  - [x] Add optional props: `onSubmitStart?: () => void` and `onUploadComplete?: (result: UploadResult) => void`
  - [x] In `handleSubmit`: call `onSubmitStart?.()` at the start (before `setUploading(true)`)
  - [x] After successful upload: call `onUploadComplete?.(data)` before `setResult(data)`
  - [x] Internal "Parsed N lines" display remains — it is still shown when `FileUpload` is used standalone (e.g. in unit tests) OR when `AnalysisView` decides to show the upload form
  - [x] **Do NOT break existing `FileUpload` unit tests** — the component must still work standalone

- [x] Task 4 — Update `frontend/src/router.tsx` (AC1)
  - [x] Import `AnalysisView` instead of `FileUpload` for the `/analysis` route
  - [x] `analysisRoute` component → `AnalysisView`
  - [x] No other changes to the route tree

- [x] Task 5 — Update `UploadResult` type used by `FileUpload` (Task 3 dependency)
  - [x] `UploadResult` in `analysisApi.ts` currently has `{ cacheId, lineCount, redactionSummary }` — this is the correct shape from the API (already fixed in prior work)
  - [x] Ensure `RedactionReviewPanel` accepts `redactionSummary` typed as `Array<{ type: string; start: number; end: number }>`; cast from `unknown` if needed (the scrubber returns this shape per architecture.md)
  - [x] Update `UploadResult` in `analysisApi.ts` to explicitly type `redactionSummary: Array<{ type: string; start: number; end: number }>` instead of `unknown`

- [x] Task 6 — Create `frontend/src/features/analysis/RedactionReviewPanel.test.tsx` (AC2, AC7)
  - [x] renders "No sensitive content detected." when `redactionSummary` is empty
  - [x] renders grouped redaction counts (e.g. "3 × PERSON") for non-empty summary
  - [x] "Confirm analysis" button is present and calls `onConfirm` when clicked

- [x] Task 7 — Create `frontend/src/features/analysis/AnalysisView.test.tsx` (AC1–AC6)
  - [x] renders `FileUpload` when pipeline is `idle`
  - [x] renders `PipelineProgress` when pipeline is not `idle`
  - [x] renders `RedactionReviewPanel` with "Confirm analysis" button when state is `awaiting-review`
  - [x] clicking "Confirm analysis" calls `POST /api/v1/analysis-jobs` and transitions to `analysing`
  - [x] renders `CancelButton` when pipeline is `analysing`
  - [x] renders `AnalysisOutput` when `analysisOutput` is set and pipeline is `complete`

- [x] Task 8 — Finalize
  - [x] Run `npx vitest run` in `frontend/` — all tests pass (60/60)
  - [x] TypeScript compilation passes with no errors
  - [x] Story → review, sprint-status updated

## Dev Notes

### Architecture — this is the missing `AnalysisView.tsx`

The architecture spec at `_bmad-output/planning-artifacts/architecture.md#frontend-structure` explicitly lists:
```
frontend/src/features/analysis/
  ├── AnalysisView.tsx          ← THIS IS WHAT THIS STORY CREATES
  ├── RedactionReviewPanel.tsx  ← THIS IS WHAT THIS STORY CREATES
  ├── PipelineProgress.tsx      ← exists
  ├── AnalysisOutput.tsx        ← exists
  ├── useAnalysisPipeline.ts    ← exists
  ├── useAnalysisStream.ts      ← exists
  ├── analysisApi.ts            ← exists
  ├── FileUpload.tsx            ← exists (modify with optional callbacks)
  └── CancelButton.tsx          ← exists
```

The `router.tsx` currently sets `component: FileUpload` on the `/analysis` route. This is the core gap — `AnalysisView` never got created to orchestrate the pipeline.

### Data flow through AnalysisView

```
idle
  ↓ user clicks Upload
SUBMIT dispatched → fetching
  ↓ POST /api/v1/logs/upload returns { cacheId, lineCount, redactionSummary }
FETCH_COMPLETE → scrubbing (brief — upload API already scrubbed)
SCRUB_COMPLETE → awaiting-review
  ↓ user clicks "Confirm analysis"
POST /api/v1/analysis-jobs { cacheId } → { jobId }
REVIEW_CONFIRMED → analysing
  ↓ useAnalysisStream opens SSE to /api/v1/analysis-jobs/:id/stream
  ↓ event: token arrives
TOKEN → streaming
  ↓ event: complete arrives
COMPLETE → complete  (AnalysisOutput renders)
```

Note: `fetching → scrubbing → awaiting-review` happens fast (upload is synchronous). Dispatch `FETCH_COMPLETE` and `SCRUB_COMPLETE` in sequence right after upload succeeds, before storing `cacheId`. The user sees the pipeline flash through stages.

### POST /api/v1/analysis-jobs

```typescript
// In AnalysisView.tsx handleConfirm:
const token = await getCsrfToken() // from apiClient.ts internals — OR use apiPost
const res = await fetch('/api/v1/analysis-jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
  credentials: 'include',
  body: JSON.stringify({ cacheId }),
})
const { jobId } = await res.json()
setJobId(jobId)
dispatch({ type: 'REVIEW_CONFIRMED' })
```

Alternatively, add `postAnalysisJob(cacheId: string): Promise<{ jobId: string }>` to `analysisApi.ts` and use `apiPost`.

### UploadResult type fix

Currently `redactionSummary: unknown` in `analysisApi.ts`. Change to:
```typescript
interface UploadResult {
  cacheId: string
  lineCount: number
  redactionSummary: Array<{ type: string; start: number; end: number }>
}
```

The scrubber service returns exactly this shape (see `scrubber/main.py` and `scrubber/pipeline/`).

### FileUpload callback props pattern

```typescript
interface FileUploadProps {
  onSubmitStart?: () => void
  onUploadComplete?: (result: UploadResult) => void
}

export default function FileUpload({ onSubmitStart, onUploadComplete }: FileUploadProps = {}) {
  // ...
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    onSubmitStart?.()   // ← add this
    setError(null)
    setResult(null)
    setUploading(true)
    try {
      const data = await uploadLogFile(file)
      onUploadComplete?.(data)  // ← add this
      setResult(data)
    } catch ...
  }
```

### e2e test failures this story fixes

The following analysis.spec.ts tests fail because `AnalysisView` doesn't exist:
- `AC1: uploading a .log fixture file triggers network request` — upload works but "Parsed" text appears in `FileUpload`, not after a review step
- `pipeline transitions through all stages` — no `PipelineProgress` or review step
- `story-5.1 AC2: fetching stage label appears` — `stage-fetching` test-id never appears
- All tests expecting `/confirm|approve|review/i` button
- All tests expecting `stage-analysing`, `stage-streaming` test-ids
- All structured output tests (they can't get past the review step)

### What this story does NOT fix (separate story)

- Auth tests 20/21/22 (login redirect) — separate story 1.7
- Analysis tests that require real LLM completion (story-4.4, 4.5) — these need real API key and will be slow; may need separate e2e configuration

### References

- Architecture structure: [_bmad-output/planning-artifacts/architecture.md](../_bmad-output/planning-artifacts/architecture.md#frontend-structure)
- Data flow: architecture.md#data-flow
- `useAnalysisPipeline`: [frontend/src/features/analysis/useAnalysisPipeline.ts](../../frontend/src/features/analysis/useAnalysisPipeline.ts)
- `useAnalysisStream`: [frontend/src/features/analysis/useAnalysisStream.ts](../../frontend/src/features/analysis/useAnalysisStream.ts)
- `CancelButton`: [frontend/src/features/analysis/CancelButton.tsx](../../frontend/src/features/analysis/CancelButton.tsx)
- `PipelineProgress`: [frontend/src/features/analysis/PipelineProgress.tsx](../../frontend/src/features/analysis/PipelineProgress.tsx)
- `AnalysisOutput`: [frontend/src/features/analysis/AnalysisOutput.tsx](../../frontend/src/features/analysis/AnalysisOutput.tsx)
- `FileUpload`: [frontend/src/features/analysis/FileUpload.tsx](../../frontend/src/features/analysis/FileUpload.tsx)
- `router.tsx`: [frontend/src/router.tsx](../../frontend/src/router.tsx)
- Story 4.3 (API): [_bmad-output/implementation-artifacts/4-3-llm-analysis-request-and-streamed-token-output.md](./4-3-llm-analysis-request-and-streamed-token-output.md)
- Story 5.2 (CancelButton): [_bmad-output/implementation-artifacts/5-2-in-flight-analysis-cancellation.md](./5-2-in-flight-analysis-cancellation.md)
- Story 5.3 (useAnalysisStream): [_bmad-output/implementation-artifacts/5-3-non-blocking-ui-during-long-running-operations.md](./5-3-non-blocking-ui-during-long-running-operations.md)
- e2e test failures: [e2e/analysis.spec.ts](../../e2e/analysis.spec.ts)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (GitHub Copilot)

### Review Findings

- [x] [Review][Patch] F1: Merge duplicate `import type` from `./analysisApi.js` into one statement [AnalysisView.tsx:14-16]
- [x] [Review][Patch] F2: Upload failure after `onSubmitStart` fires leaves pipeline stuck in `fetching` — add `onUploadError` callback to `FileUpload` that dispatches `RESET` in `AnalysisView` [AnalysisView.tsx, FileUpload.tsx]
- [x] [Review][Patch] F3: "Confirm analysis" button not disabled while `postAnalysisJob` is pending — rapid clicks spawn multiple orphaned jobs [AnalysisView.tsx:69-79, RedactionReviewPanel.tsx:36-38]
- [x] [Review][Patch] F4: AC6 complete-state reset test is a stub — enhance `useAnalysisStream` mock to expose `onComplete` trigger so the `complete → idle` reset path can be tested [AnalysisView.test.tsx]
- [x] [Review][Patch] F5: Raw `streamOutput <pre>` persists alongside `AnalysisOutput` in `complete` state — hide during complete, show only during streaming [AnalysisView.tsx:124-132] (decision: Option A)
- [x] [Review][Defer] F6: Dual CSRF token caches — `fetchCsrfToken` in `analysisApi.ts` vs internal cache in `apiClient.ts` [analysisApi.ts:39-42] — deferred, pre-existing

### Completion Notes List

Story created by PM agent (John) based on e2e test gap analysis. The gap: all pipeline UI components exist individually but no `AnalysisView` orchestrator wires them together. The router uses `FileUpload` directly as the analysis page component.

**Implemented 2026-04-29:**
- Created `RedactionReviewPanel.tsx` — groups redactions by type, shows "No sensitive content detected." for empty summary, "Confirm analysis" button matches `/confirm/i`
- Created `AnalysisView.tsx` — full pipeline orchestrator; idle renders `FileUpload` with callbacks; non-idle renders `PipelineProgress` + stage-appropriate components; `handleConfirm` calls `POST /api/v1/analysis-jobs`; reset clears all local state
- Updated `FileUpload.tsx` — added optional `onSubmitStart`/`onUploadComplete` props; existing tests unaffected (props default to undefined)
- Updated `router.tsx` — `/analysis` route now uses `AnalysisView` instead of `FileUpload`
- Updated `analysisApi.ts` — exported `RedactionItem` + `UploadResult` types (typed `redactionSummary` as `RedactionItem[]` instead of `unknown`); added `postAnalysisJob(cacheId)` using `apiPost`
- 60/60 frontend unit tests pass; TypeScript compiles cleanly
- Key test pattern: used `trigger-full-upload` mock button that fires both `onSubmitStart` and `onUploadComplete` in one React event (batched) to avoid component unmount between clicks

### File List

**NEW:**
- `frontend/src/features/analysis/AnalysisView.tsx`
- `frontend/src/features/analysis/AnalysisView.test.tsx`
- `frontend/src/features/analysis/RedactionReviewPanel.tsx`
- `frontend/src/features/analysis/RedactionReviewPanel.test.tsx`

**MODIFY:**
- `frontend/src/features/analysis/FileUpload.tsx` (added optional `onSubmitStart`/`onUploadComplete` callback props)
- `frontend/src/features/analysis/analysisApi.ts` (exported `RedactionItem`, `UploadResult`; typed `redactionSummary`; added `postAnalysisJob`; imported `apiPost`)
- `frontend/src/router.tsx` (changed `/analysis` route component from `FileUpload` to `AnalysisView`)

## Change Log

- 2026-04-29: Implemented all tasks — created `AnalysisView.tsx` + `RedactionReviewPanel.tsx` + tests; updated `FileUpload.tsx`, `analysisApi.ts`, `router.tsx`. 60/60 tests pass. Status → review.
