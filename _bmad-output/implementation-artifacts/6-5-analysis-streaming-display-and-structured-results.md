# Story 6.5: Analysis streaming display and structured results screen

Status: done

> **Design system:** shadcn/ui + Tailwind CSS. Custom components: `TokenStream`, `AnalysisResultSection`. Full UX specification: `_bmad-output/planning-artifacts/ux-design-specification.md`

## Story

As a user,
I want to see LLM analysis tokens stream onto the page in real time after I confirm the redaction review, and then read the structured findings clearly organised into sections when the analysis is complete,
so that I get immediate feedback while waiting and can quickly locate the root cause, errors, and recommended actions when results arrive.

## User Flow

### Phase 1 — Analysing (streaming in progress)

1. User clicks "Confirm and analyze" on the redaction review panel
2. Pipeline transitions to `analysing`; `PipelineProgress` shows Analysing as the active stage
3. `POST /api/v1/analysis-jobs` is called; job ID is stored
4. SSE stream connects to `GET /api/v1/analysis-jobs/:id/stream`
5. First tokens arrive → pipeline transitions to `streaming`
6. **Live stream area** appears below the pipeline progress bar:
   - Text builds progressively as tokens arrive (LLM output appended in real time)
   - Area auto-scrolls to keep the latest output visible
7. **Cancel button** is clearly visible throughout `analysing` and `streaming` states with label "Cancel analysis"
8. User can read partial output as it arrives

### Phase 2 — Complete (structured results)

1. SSE emits `event: complete` with structured JSON payload
2. Pipeline transitions to `complete`; `PipelineProgress` shows Complete stage checked
3. Live stream area remains visible (full raw output stays readable)
4. **Structured results** (`AnalysisOutput`) render below the stream area:
   - AI disclaimer banner (non-dismissable, first element)
   - Five result sections (detailed below)
5. **"Start new analysis"** button appears at the bottom of the page
6. Cancel button changes label to "Start new analysis" (or "Reset") and resets to `idle` — either button may be used

### Phase 3 — Cancelled or error

1. User clicks "Cancel analysis" during streaming → pipeline transitions to `cancelled`
2. The `DELETE /api/v1/analysis-jobs/:id` API is called (handled by `CancelButton`)
3. Live stream area freezes at its current content
4. The "Cancel analysis" button changes to "Start new analysis"
5. User can click "Start new analysis" → pipeline resets to `idle`, upload form appears

If an error occurs during analysis:
- Error message is shown below the `PipelineProgress` (already implemented in pipeline state machine)
- "Start new analysis" button is available to recover

## Screen Elements

### Live stream area

| Element | Notes |
|---|---|
| Container | Scrollable; renders inside `AnalysisView` below `PipelineProgress`; visible during `streaming` and `complete` states |
| Content | Accumulated token text rendered progressively; auto-scrolls to bottom on each new token |
| Text presentation | `<pre className="font-mono text-sm leading-snug">` or `<div className="font-mono text-sm leading-snug whitespace-pre-wrap">`; monospace font is required — signals machine output |
| Label / heading | Small `text-xs text-zinc-500` label above: "LLM output" to distinguish it from structured results below |
| Accessibility | `aria-live="polite"`, `aria-label="Analysis output"`, `tabindex="0"` on scroll container for keyboard scroll |

### Cancel button (`CancelButton` component — polish)

| State | Label | Behaviour |
|---|---|---|
| `analysing` / `streaming` | "Cancel analysis" | Calls `DELETE /api/v1/analysis-jobs/:id`; dispatches `CANCEL` |
| `complete` / `cancelled` | "Start new analysis" | Dispatches `RESET`; clears all in-memory state |
| `error` | "Start new analysis" | Same as above |

The button must always be clearly visible (not hidden or faded out) in any non-`idle` state.

### Structured results (`AnalysisOutput` component — polish)

All five sections are already implemented. This story ensures each section meets the layout and element requirements below.

#### AI disclaimer banner
| Element | Notes |
|---|---|
| Banner | shadcn/ui `Alert variant="warning"` (amber) with `role="alert"` and `aria-label="AI-generated disclaimer"` |
| Text | "AI-generated — not authoritative" |
| Non-dismissable | No close button; always visible when results are present |

#### Errors & Frequency section
| Element | Notes |
|---|---|
| Section heading | "Errors & Frequency" (`<h2>`) |
| List | Each row: error type (monospace), occurrence count, distribution note |
| Empty state | "No errors identified." |

#### Anomalies section
| Element | Notes |
|---|---|
| Section heading | "Anomalies" (`<h2>`) |
| List | Bulleted list of anomaly descriptions |
| Empty state | "No anomalies identified." |

#### Root Cause Hypothesis section
| Element | Notes |
|---|---|
| Section heading | "Root Cause Hypothesis" (`<h2>`) |
| Hypothesis paragraph | Full text of the LLM hypothesis |
| Confidence badge | Inline badge showing "high", "medium", or "low" next to the hypothesis |
| Evidence excerpts | One or more `<blockquote className="font-mono text-sm border-l-4 border-zinc-300 pl-4">` elements; each contains a log line cited by the LLM as evidence |
| Empty state | Not applicable — root cause is always present if analysis completed successfully |

#### Event Timeline section
| Element | Notes |
|---|---|
| Section heading | "Event Timeline" (`<h2>`) |
| List | Ordered chronological list; each entry has a timestamp and event description |
| Empty state | "No timeline data." |

#### Recommended Next Steps section
| Element | Notes |
|---|---|
| Section heading | "Recommended Next Steps" (`<h2>`) |
| List | Ordered (`<ol>`) list of action items with step numbers |
| Empty state | "No recommendations." |

### "Start new analysis" button (bottom of page)

| Element | Notes |
|---|---|
| Button | Appears below `AnalysisOutput` when pipeline state is `complete` |
| Label | "Start new analysis" |
| Action | Dispatches `RESET`; clears `cacheId`, `jobId`, `redactionSummary`, `analysisOutput`, `streamOutput`; pipeline returns to `idle` |

## Acceptance Criteria

1. **Given** the pipeline is in `streaming` state, **When** tokens arrive, **Then** the live stream area is visible and new text is appended to the bottom; the container auto-scrolls.

2. **Given** the pipeline is in `analysing` or `streaming` state, **When** I look at the page, **Then** a "Cancel analysis" button is visible.

3. **Given** the pipeline reaches `complete`, **When** the `event: complete` SSE payload arrives, **Then** the `AnalysisOutput` component renders below the stream area with the AI disclaimer banner as the first element.

4. **Given** the analysis is complete, **When** I read the results, **Then** I can see all five sections: Errors & Frequency, Anomalies, Root Cause Hypothesis, Event Timeline, and Recommended Next Steps.

5. **Given** the root cause section has evidence excerpts, **When** I read them, **Then** each excerpt is rendered in a `<blockquote>` element in monospace font.

6. **Given** the analysis is complete, **When** I look at the bottom of the page, **Then** a "Start new analysis" button is visible.

7. **Given** I click "Start new analysis" (either from the `CancelButton` or the bottom button), **When** the action completes, **Then** the pipeline resets to `idle` and the file upload form appears.

8. **Given** I cancel the analysis mid-stream, **When** the cancel completes, **Then** the stream area freezes and the button label changes to "Start new analysis".

9. **Given** an error occurs during analysis, **When** the error is displayed, **Then** I see the pipeline error state and can click "Start new analysis" to reset.

## Tasks / Subtasks

- [x] Task 1 — Polish `frontend/src/features/analysis/AnalysisView.tsx`
  - [x] Add live stream container:
    - Render a `<div>` or `<pre>` for `streamOutput` in `streaming` and `complete` states
    - Add `ref` + `useEffect` to scroll the container to the bottom when `streamOutput` changes
    - Add an optional small heading/label above it: "Raw output"
  - [x] Add "Start new analysis" `<button>` at the bottom of the output area, visible only in `complete` state
    - On click: dispatch `RESET`; clear `cacheId`, `jobId`, `redactionSummary`, `analysisOutput`, `streamOutput` via `setState` calls
  - [x] Ensure `AnalysisOutput` renders below the stream area when `analysisOutput !== null`

- [x] Task 2 — Polish `frontend/src/features/analysis/CancelButton.tsx`
  - [x] Audit the current label in each state: confirm "Cancel analysis" during `analysing`/`streaming` and "Start new analysis" during `complete`/`cancelled`/`error`
  - [x] Ensure button is always visible (not conditionally hidden) in any non-`idle` state

- [x] Task 3 — Polish `frontend/src/features/analysis/AnalysisOutput.tsx`
  - [x] "Event Timeline" section: add empty state `<p>No timeline data.</p>` when `output.timeline` is empty (check current implementation — may already be present)
  - [x] "Recommended Next Steps" section: render as `<ol>` with `<li>` for each step; add empty state `<p>No recommendations.</p>`
  - [x] Ensure evidence excerpts in Root Cause section are in `<blockquote>` with monospace presentation (already partially implemented — verify)
  - [x] Ensure all five section headings are `<h2>` elements with `id` attributes for `aria-labelledby` (already partially implemented — verify)

- [x] Task 4 — Update `frontend/src/features/analysis/AnalysisView.test.tsx`
  - [x] Add test: live stream container renders `streamOutput` text during `streaming` state
  - [x] Add test: "Start new analysis" button is present in `complete` state
  - [x] Add test: clicking "Start new analysis" in `complete` state resets pipeline to `idle`

## Test Scenarios

*Unit (Vitest + React Testing Library):*
- `AnalysisView`: live stream container renders accumulated `streamOutput` text in `streaming` state
- `AnalysisView`: "Start new analysis" button is visible in `complete` state
- `AnalysisView`: clicking "Start new analysis" dispatches `RESET` and clears output state
- `CancelButton`: label is "Cancel analysis" during `streaming` state
- `CancelButton`: label is "Start new analysis" during `complete` state
- `AnalysisOutput`: renders all five section headings
- `AnalysisOutput`: Root Cause evidence excerpts are rendered in `<blockquote>` elements
- `AnalysisOutput`: "Event Timeline" section shows "No timeline data." when timeline array is empty
- `AnalysisOutput`: "Recommended Next Steps" renders as ordered list

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Full happy path: upload → confirm → analysis completes → all five result sections visible (extend existing test)
- "Start new analysis" button is visible after analysis completes and resets the view when clicked
