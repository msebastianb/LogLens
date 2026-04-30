# Story 5.1: Per-stage pipeline progress indicators

Status: done

## Story

As a user,
I want to see a clear progress indicator for each stage of the analysis pipeline as it runs,
So that I always know what the system is doing and can see that it hasn't stalled.

## Acceptance Criteria

1. **Given** I submit a log source for analysis, **When** the pipeline state machine transitions through stages, **Then** the UI renders a stage indicator that visually reflects the current state: `idle → fetching → scrubbing → awaiting-review → analysing → streaming → complete` (or `error` / `cancelled`).

2. **Given** the pipeline enters the `fetching` state, **When** the progress indicator renders, **Then** a visible activity indicator appears and shows "Fetching logs…".

3. **Given** the pipeline enters the `scrubbing` state, **When** the progress indicator renders, **Then** it shows "Scrubbing for PII and secrets…" with the previous stage marked complete.

4. **Given** the pipeline enters the `analysing` or `streaming` state, **When** the progress indicator renders, **Then** it shows "Analysing with LLM…" and the analysis output area becomes visible.

5. **Given** the pipeline reaches `complete`, **When** the progress indicator renders, **Then** all stages are marked complete and the full structured analysis output is displayed.

6. **Given** the pipeline enters `error` state, **When** the progress indicator renders, **Then** the failing stage is highlighted with the RFC 7807 error `detail` message displayed inline; previous completed stages remain marked complete.

## Tasks / Subtasks

- [x] Task 1 — Create `frontend/src/features/analysis/useAnalysisPipeline.ts` (AC1–AC6)
  - [x] Define `PipelineState` union type: `'idle' | 'fetching' | 'scrubbing' | 'awaiting-review' | 'analysing' | 'streaming' | 'complete' | 'error' | 'cancelled'`
  - [x] Define `PipelineAction` discriminated union:
    - `{ type: 'SUBMIT' }` → `idle → fetching`
    - `{ type: 'FETCH_COMPLETE' }` → `fetching → scrubbing`
    - `{ type: 'SCRUB_COMPLETE' }` → `scrubbing → awaiting-review`
    - `{ type: 'REVIEW_CONFIRMED' }` → `awaiting-review → analysing`
    - `{ type: 'TOKEN' }` → `analysing → streaming` (no-op if already `streaming`)
    - `{ type: 'COMPLETE' }` → `streaming → complete`
    - `{ type: 'ERROR'; detail: string }` → any active state → `error`; stores `errorDetail`
    - `{ type: 'CANCEL' }` → any active state → `cancelled`; no-op from `idle`/`complete`/`error`/`cancelled`
    - `{ type: 'RESET' }` → any state → `idle`
  - [x] Define `PipelineStore` state shape: `{ state: PipelineState; completedStages: PipelineState[]; errorDetail: string | null }`
  - [x] Implement `pipelineReducer(store, action): PipelineStore` — pure function, no side effects
    - On any active-state transition that advances stage: append previous state to `completedStages`
    - On `ERROR`: set `errorDetail` from action, do NOT clear `completedStages`
    - On `RESET`: return initial store `{ state: 'idle', completedStages: [], errorDetail: null }`
  - [x] Export `useAnalysisPipeline()` hook: `useReducer(pipelineReducer, initialStore)` — returns `[store, dispatch]`
  - [x] Export `pipelineReducer` and types for use in tests and `PipelineProgress`

- [x] Task 2 — Create `frontend/src/features/analysis/PipelineProgress.tsx` (AC1–AC6)
  - [x] Accept props: `{ store: PipelineStore }`
  - [x] Define ordered stage list: `['fetching', 'scrubbing', 'awaiting-review', 'analysing', 'complete']` (streaming is a sub-state of analysing, not a separate rendered row)
  - [x] For each stage render a row: done indicator (✓) if in `completedStages`, active indicator (spinner/pulse) if current state, pending (—) otherwise
  - [x] Stage labels mapping:
    - `fetching` → "Fetching logs…"
    - `scrubbing` → "Scrubbing for PII and secrets…"
    - `awaiting-review` → "Awaiting redaction review…"
    - `analysing` → "Analysing with LLM…"
    - `streaming` → "Analysing with LLM…" (same label — streaming is a sub-state of analysing)
    - `complete` → "Analysis complete"
  - [x] In `error` state: highlight the current failing stage (last active stage before error) with the `errorDetail` message below it
  - [x] Hide component entirely when `store.state === 'idle'`
  - [x] Use `data-testid` on the stage rows for testability: `data-testid="stage-{stageName}"`

- [x] Task 3 — Create `frontend/src/features/analysis/useAnalysisPipeline.test.ts` (AC1–AC6)
  - [x] `idle → fetching` on `SUBMIT`
  - [x] `fetching → scrubbing` on `FETCH_COMPLETE`; `fetching` added to `completedStages`
  - [x] `scrubbing → awaiting-review` on `SCRUB_COMPLETE`; `scrubbing` added to `completedStages`
  - [x] `awaiting-review → analysing` on `REVIEW_CONFIRMED`; `awaiting-review` added to `completedStages`
  - [x] `analysing → streaming` on first `TOKEN`; `analysing` added to `completedStages`
  - [x] second `TOKEN` in `streaming` state is a no-op (stays `streaming`, no duplicate in `completedStages`)
  - [x] `streaming → complete` on `COMPLETE`; `streaming` added to `completedStages`
  - [x] `ERROR` from any active state → `error`; `completedStages` preserved; `errorDetail` set
  - [x] `CANCEL` from active state → `cancelled`
  - [x] `CANCEL` from `idle` → no-op (stays `idle`)
  - [x] `RESET` from any state → initial store

- [x] Task 4 — Create `frontend/src/features/analysis/PipelineProgress.test.tsx` (AC1–AC6)
  - [x] renders nothing when `store.state === 'idle'`
  - [x] renders "Fetching logs…" label when state is `fetching` (AC2)
  - [x] renders "Scrubbing for PII and secrets…" when state is `scrubbing`; fetching stage marked complete (AC3)
  - [x] renders "Analysing with LLM…" when state is `analysing` (AC4)
  - [x] all stages marked complete when state is `complete` (AC5)
  - [x] error detail message visible when state is `error` (AC6)
  - [x] completed stages show done indicator; current stage shows active indicator

- [x] Task 5 — Finalize
  - [x] Run `npx vitest run` in `frontend/` — all pass
  - [x] Story → review, sprint-status updated

## Dev Notes

### This is a frontend-only story — no backend changes

Do NOT touch: `api/`, `scrubber/`, `AnalysisOutput.tsx`, `analysisApi.ts`, `FileUpload.tsx`.

### State machine design — `completedStages` tracks history

```typescript
// frontend/src/features/analysis/useAnalysisPipeline.ts

export type PipelineState =
  | 'idle'
  | 'fetching'
  | 'scrubbing'
  | 'awaiting-review'
  | 'analysing'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'cancelled'

export type PipelineAction =
  | { type: 'SUBMIT' }
  | { type: 'FETCH_COMPLETE' }
  | { type: 'SCRUB_COMPLETE' }
  | { type: 'REVIEW_CONFIRMED' }
  | { type: 'TOKEN' }
  | { type: 'COMPLETE' }
  | { type: 'ERROR'; detail: string }
  | { type: 'CANCEL' }
  | { type: 'RESET' }

export interface PipelineStore {
  state: PipelineState
  completedStages: PipelineState[]
  errorDetail: string | null
}

const initialStore: PipelineStore = {
  state: 'idle',
  completedStages: [],
  errorDetail: null,
}

const ACTIVE_STATES: PipelineState[] = [
  'fetching', 'scrubbing', 'awaiting-review', 'analysing', 'streaming',
]

export function pipelineReducer(store: PipelineStore, action: PipelineAction): PipelineStore {
  switch (action.type) {
    case 'SUBMIT':
      return store.state === 'idle'
        ? { ...store, state: 'fetching' }
        : store
    case 'FETCH_COMPLETE':
      return store.state === 'fetching'
        ? { ...store, state: 'scrubbing', completedStages: [...store.completedStages, 'fetching'] }
        : store
    case 'SCRUB_COMPLETE':
      return store.state === 'scrubbing'
        ? { ...store, state: 'awaiting-review', completedStages: [...store.completedStages, 'scrubbing'] }
        : store
    case 'REVIEW_CONFIRMED':
      return store.state === 'awaiting-review'
        ? { ...store, state: 'analysing', completedStages: [...store.completedStages, 'awaiting-review'] }
        : store
    case 'TOKEN':
      return store.state === 'analysing'
        ? { ...store, state: 'streaming', completedStages: [...store.completedStages, 'analysing'] }
        : store  // no-op if already streaming
    case 'COMPLETE':
      return store.state === 'streaming'
        ? { ...store, state: 'complete', completedStages: [...store.completedStages, 'streaming'] }
        : store
    case 'ERROR':
      return ACTIVE_STATES.includes(store.state)
        ? { ...store, state: 'error', errorDetail: action.detail }
        : store
    case 'CANCEL':
      return ACTIVE_STATES.includes(store.state)
        ? { ...store, state: 'cancelled' }
        : store
    case 'RESET':
      return initialStore
    default:
      return store
  }
}

export function useAnalysisPipeline() {
  return useReducer(pipelineReducer, initialStore)
}
```

Don't forget: `import { useReducer } from 'react'` at the top.

### `PipelineProgress.tsx` — stage rows pattern

```typescript
// frontend/src/features/analysis/PipelineProgress.tsx
import type { PipelineStore, PipelineState } from './useAnalysisPipeline.js'

interface Props {
  store: PipelineStore
}

const STAGES: PipelineState[] = [
  'fetching', 'scrubbing', 'awaiting-review', 'analysing', 'streaming', 'complete',
]

const STAGE_LABELS: Record<string, string> = {
  'fetching': 'Fetching logs…',
  'scrubbing': 'Scrubbing for PII and secrets…',
  'awaiting-review': 'Awaiting redaction review…',
  'analysing': 'Analysing with LLM…',
  'streaming': 'Analysing with LLM…',
  'complete': 'Analysis complete',
}

export default function PipelineProgress({ store }: Props) {
  if (store.state === 'idle') return null

  return (
    <div role="status" aria-live="polite">
      {STAGES.map(stage => {
        const isDone = store.completedStages.includes(stage)
        const isActive = store.state === stage ||
          (stage === 'analysing' && store.state === 'streaming')
        const isError = store.state === 'error' && !isDone && isActive // highlight last active
        return (
          <div key={stage} data-testid={`stage-${stage}`}>
            <span>{isDone ? '✓' : isActive ? '…' : '—'}</span>
            <span>{STAGE_LABELS[stage]}</span>
            {isError && store.errorDetail && (
              <span role="alert">{store.errorDetail}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

**Note on error highlighting:** When state is `error`, `store.state` is `'error'` — NOT one of the STAGES. To highlight the failing stage, track the last active state before the error transition. The simplest approach: the last stage NOT in `completedStages` among the active stages is the one that failed. Alternatively, store `errorStage` in the store. Choose whichever approach makes the test pass — `data-testid` on stage rows is what the test queries.

A simpler pattern: add `errorStage: PipelineState | null` to `PipelineStore` and set it in the `ERROR` reducer branch. Then in the component:

```typescript
const isError = store.state === 'error' && stage === store.errorStage
```

Either approach is valid — pick one and be consistent with tests.

### Test file — reducer tests are pure function tests (no React)

```typescript
// useAnalysisPipeline.test.ts — NOT .tsx — pure reducer, no JSX
import { describe, it, expect } from 'vitest'
import { pipelineReducer } from './useAnalysisPipeline.js'

const initial = { state: 'idle' as const, completedStages: [], errorDetail: null }
```

### `PipelineProgress.test.tsx` — test pattern

```typescript
import { render, screen } from '@testing-library/react'
import PipelineProgress from './PipelineProgress.js'
import type { PipelineStore } from './useAnalysisPipeline.js'

function makeStore(overrides: Partial<PipelineStore> = {}): PipelineStore {
  return { state: 'idle', completedStages: [], errorDetail: null, ...overrides }
}
```

Query stage rows with `screen.getByTestId('stage-fetching')` etc. Check done/active indicators by text content or `aria-*` attributes on the indicator span.

### Architecture constraint: no `isLoading` boolean flags

The state machine is the single source of truth. Do NOT add `isLoading: boolean` or similar derived boolean fields to the store. All derived state (e.g. "is pipeline running?") is computed from `store.state` at the call site:

```typescript
const isRunning = ['fetching', 'scrubbing', 'analysing', 'streaming'].includes(store.state)
```

### Files to create

| File | Change |
|------|--------|
| `frontend/src/features/analysis/useAnalysisPipeline.ts` | NEW — reducer + hook + types |
| `frontend/src/features/analysis/PipelineProgress.tsx` | NEW — progress indicator component |
| `frontend/src/features/analysis/useAnalysisPipeline.test.ts` | NEW — 11 reducer tests |
| `frontend/src/features/analysis/PipelineProgress.test.tsx` | NEW — 7 component tests |

No changes to existing files.

### References

- [Source: epics.md — Story 5.1 AC and Test Scenarios]
- [Source: architecture.md — Pipeline State Machine, no boolean flags, state names]
- [Source: architecture.md — Enforcement Guidelines: named pipeline states]
- [Source: frontend/src/features/analysis/AnalysisOutput.test.tsx — test pattern reference]
- [Source: frontend/src/test/setup.ts — @testing-library/jest-dom already imported]
- [Source: frontend/vitest.config.ts — jsdom, globals: true, setupFiles]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

### 2026-04-30 — Remove duplicate "Analysing with LLM…" row

**Problem:** `PipelineProgress.tsx` rendered both `analysing` and `streaming` as separate rows, each showing "Analysing with LLM…" — causing a visual duplicate in the UI.

**Fix:** Removed `'streaming'` from the `STAGES` array. The `analysing` row now covers both states: it shows as active when current state is `analysing` OR `streaming`, and as done when `streaming` is in `completedStages`. The `streaming` state still exists in the state machine and is tracked in `completedStages` — it just doesn't render its own progress row.
