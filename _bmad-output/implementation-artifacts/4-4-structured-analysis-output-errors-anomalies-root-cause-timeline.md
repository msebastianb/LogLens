# Story 4.4: Structured analysis output — errors, anomalies, root cause, timeline

Status: done

## Story

As a user,
I want the analysis output to clearly present identified errors with frequency, anomalous patterns, a root cause hypothesis with confidence, and a timeline of affected components,
So that I can quickly understand what went wrong and where to focus my investigation.

## Acceptance Criteria

1. **Given** the analysis completes, **When** the `event: complete` payload is received, **Then** the UI renders four distinct sections: "Errors & Frequency", "Anomalies", "Root Cause Hypothesis", and "Event Timeline".

2. **Given** the "Errors & Frequency" section, **When** rendered, **Then** each identified error type is shown with its occurrence count and a distribution indicator (e.g., time-based or component-based).

3. **Given** the "Root Cause Hypothesis" section, **When** rendered, **Then** the hypothesis text is accompanied by a confidence indicator (High / Medium / Low) and is visually distinct from factual log data.

4. **Given** the "Event Timeline" section, **When** rendered, **Then** events are ordered chronologically with component labels derived from the log content.

5. **Given** any section of the analysis output, **When** rendered, **Then** the output includes at least one actual log excerpt as evidence (cited inline) and carries a visible label "AI-generated — not authoritative".

## Tasks / Subtasks

- [x] Task 1 — Define `AnalysisOutput` type in `frontend/src/features/analysis/analysisApi.ts`
  - [x] Add and export `AnalysisOutput` interface matching the backend schema:
    - `errors: Array<{ type: string; count: number; distribution: string }>`
    - `anomalies: string[]`
    - `rootCause: { hypothesis: string; confidence: 'High' | 'Medium' | 'Low'; evidenceExcerpts: string[] }`
    - `timeline: Array<{ timestamp: string; component: string; event: string }>`
    - `nextSteps: string[]` — included in type for forward-compat with Story 4.5; not rendered in this story

- [x] Task 2 — Create `frontend/src/features/analysis/AnalysisOutput.tsx` (AC1–AC5)
  - [x] Accept `props: { output: AnalysisOutput }` — pure display component, no side effects
  - [x] Render "AI-generated — not authoritative" label at the top of the component (AC5)
  - [x] Render "Errors & Frequency" section: heading + list of `{ type, count, distribution }` items (AC1, AC2)
  - [x] Render "Anomalies" section: heading + list of anomaly strings (AC1)
  - [x] Render "Root Cause Hypothesis" section: heading + hypothesis text + confidence badge (AC1, AC3)
    - [x] Confidence badge must contain the text "High", "Medium", or "Low" and be visually distinct (a `<span>` with data-testid="confidence-badge" or role="status" is fine)
  - [x] Render "Event Timeline" section: heading + chronologically sorted events with timestamp + component + event (AC1, AC4)
    - [x] Sort `timeline` array by `timestamp` (lexicographic — ISO timestamps sort correctly)
  - [x] Render evidence excerpts from `rootCause.evidenceExcerpts` inline within Root Cause section as cited quotes (AC5)
    - [x] Use `<blockquote>` or `<code>` to visually distinguish excerpts from prose

- [x] Task 3 — Create `frontend/src/features/analysis/AnalysisOutput.test.tsx`
  - [x] Renders "Errors & Frequency", "Anomalies", "Root Cause Hypothesis", "Event Timeline" sections (AC1)
  - [x] Each error entry shows `type`, `count`, and `distribution` text (AC2)
  - [x] Root cause section renders confidence badge containing "High" / "Medium" / "Low" text (AC3)
  - [x] Timeline entries appear in ascending timestamp order after sorting (AC4)
  - [x] "AI-generated — not authoritative" label is present in rendered output (AC5)
  - [x] Evidence excerpts from `rootCause.evidenceExcerpts` are rendered inside the root cause section (AC5)

- [x] Task 4 — Finalize
  - [x] Run `pnpm --filter frontend test` — all pass
  - [x] Story → review, sprint-status updated

## Dev Notes

### This is a frontend-only story — no backend changes

Do NOT touch: `api/`, `scrubber/`, `env.ts`, `schema.ts`, `analysisOutputSchema.ts` (just created in Story 4.3).

### Existing frontend file structure

Only these files exist in `frontend/src/features/analysis/` today:
- `FileUpload.tsx` — log upload form (Story 2.4)
- `FileUpload.test.tsx` — component tests (Story 2.4)
- `analysisApi.ts` — uploadLogFile only; **this file needs updating** (Task 1: add `AnalysisOutput` type)

**Files to create:** `AnalysisOutput.tsx`, `AnalysisOutput.test.tsx`

Architecture notes these as planned but not yet created:
- `AnalysisView.tsx` — full analysis page (Story 4.3/4.5)
- `useAnalysisPipeline.ts` — state machine hook (Story 4.3/4.5)
- `useAnalysisStream.ts` — SSE hook (Story 4.3)
- `RedactionReviewPanel.tsx`, `PipelineProgress.tsx`, `SessionHistory.tsx` — later stories

**DO NOT** create those files in this story.

### Test setup and dependencies

Testing libraries are already installed in `frontend/node_modules/`:
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`

`frontend/src/test/setup.ts` already imports `@testing-library/jest-dom`, so all jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.) are available globally in tests.

`vitest.config.ts` already sets `environment: 'jsdom'` and `globals: true`.

### Test file pattern — follow `FileUpload.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AnalysisOutput from './AnalysisOutput.js'
import type { AnalysisOutput as AnalysisOutputType } from './analysisApi.js'

const STUB_OUTPUT: AnalysisOutputType = {
  errors: [
    { type: 'NullPointerException', count: 12, distribution: 'UserService (8), OrderService (4)' },
  ],
  anomalies: ['Spike in 5xx responses at 14:32 UTC'],
  rootCause: {
    hypothesis: 'Unhandled null in UserService.getById after cache miss',
    confidence: 'High',
    evidenceExcerpts: ['ERROR UserService.getById: Cannot read property id of null'],
  },
  timeline: [
    { timestamp: '2026-04-28T14:30:00Z', component: 'UserService', event: 'Cache miss rate elevated' },
    { timestamp: '2026-04-28T14:32:00Z', component: 'OrderService', event: '5xx spike begins' },
  ],
  nextSteps: ['Add null check in UserService.getById before cache lookup'],
}
```

### AnalysisOutput component interface

```typescript
// frontend/src/features/analysis/AnalysisOutput.tsx
import type { AnalysisOutput } from './analysisApi.js'

interface Props {
  output: AnalysisOutput
}

export default function AnalysisOutput({ output }: Props) { ... }
```

### Confidence badge — data-testid recommended

For testability, add `data-testid="confidence-badge"` to the confidence indicator span. Tests can then use `screen.getByTestId('confidence-badge')`. Alternatively a semantic role works too.

### Timeline sort

Sort defensively even if LLM output is already ordered:
```typescript
const sortedTimeline = [...output.timeline].sort((a, b) =>
  a.timestamp.localeCompare(b.timestamp)
)
```
Use spread to avoid mutating the prop.

### "AI-generated — not authoritative" label

This is the simple label required by AC5. Story 4.5 will upgrade it to a non-dismissable persistent banner. For this story, a `<p>` or `<div>` with the text is sufficient:
```tsx
<p role="note">AI-generated — not authoritative</p>
```
Using `role="note"` makes it semantically queryable in tests: `screen.getByRole('note')`.

### Evidence excerpts inline

`rootCause.evidenceExcerpts` should render inside the Root Cause section as cited quotes. A simple approach:
```tsx
{output.rootCause.evidenceExcerpts.map((excerpt, i) => (
  <blockquote key={i}>{excerpt}</blockquote>
))}
```
Tests verify these are present in the root cause section (AC5).

### Styling — Tailwind CSS v4

Use Tailwind utility classes. No component library. Keep styling minimal and semantic — tests do not check CSS classes. Structure is: heading + list/items per section.

### `AnalysisOutput` type in `analysisApi.ts`

Add the interface export alongside `UploadResult`. DO NOT remove or change `uploadLogFile`. Existing tests for `FileUpload.test.tsx` must remain green.

### Frontend test run command

```bash
pnpm --filter frontend test
# or from frontend/:
cd frontend && pnpm test
```

### References

- [Source: epics.md — Story 4.4 AC and Test Scenarios]
- [Source: epics.md — Story 4.5 AC (nextSteps and banner upgrade — NOT this story)]
- [Source: architecture.md — Frontend Architecture: TanStack Query, state machine, SSE, AnalysisOutput component, confidence badge, AI-generated label]
- [Source: architecture.md — Data Exchange Formats: AnalysisOutput JSON schema]
- [Source: frontend/src/features/analysis/FileUpload.test.tsx — test pattern: vi.hoisted, render, screen, fireEvent]
- [Source: frontend/src/features/analysis/analysisApi.ts — file to update with AnalysisOutput type]
- [Source: frontend/src/test/setup.ts — @testing-library/jest-dom already imported]
- [Source: frontend/vitest.config.ts — jsdom, globals: true, setupFiles]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
