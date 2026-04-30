# Story 6.4: Analysis workflow UI — file upload, pipeline progress, and redaction review

Status: done

> **Design system:** shadcn/ui + Tailwind CSS. Custom components: `DropZone`, `PipelineProgress`, `RedactionReviewPanel`. Full UX specification: `_bmad-output/planning-artifacts/ux-design-specification.md`

## Story

As a user,
I want the analysis page to guide me clearly through choosing my log source, uploading a file, watching the scrubbing stages, and reviewing what was found before committing to LLM analysis,
so that I understand every step, feel in control of what data leaves my machine, and can make an informed decision at the review gate.

## User Flow

### Step 1 — Idle: choose source and upload

1. User arrives at `/analysis` (pipeline state: `idle`)
2. Page heading "Analyze Logs" is displayed
3. Log source selector is shown:
   - "Upload File" tab — selected, active
   - "Loki Query" tab — present but disabled with a "Post-MVP" label (not clickable)
4. Drop zone is displayed:
   - Contains instruction text: "Drag and drop your log file here"
   - Contains secondary action: "or click to browse"
   - Accepted formats displayed inline or below: `.log`, `.json`, `.ndjson`
   - Maximum file size note displayed: e.g. "Max 10 MB"
5. "Analyze logs" submit button is visible but **disabled** until a file is selected

### Step 2 — File selected

1. User drags a file onto the drop zone OR clicks "or click to browse" and selects via OS file picker
2. Drop zone updates to show:
   - File name
   - Formatted file size (e.g. "342 KB")
   - A "Remove" or "×" control to deselect the file
3. "Analyze logs" submit button becomes **enabled**

### Step 3 — Upload and scrubbing in progress

1. User clicks "Analyze logs"
2. `FileUpload` calls `onSubmitStart()` → pipeline dispatches `SUBMIT` (state: `fetching`)
3. `PipelineProgress` component appears above or below the form showing stages
4. Upload completes → scrubbing stage becomes active
5. Scrubbing completes → pipeline transitions to `awaiting-review`

### Step 4 — Redaction review

1. `FileUpload` disappears (or is hidden); `RedactionReviewPanel` appears
2. Panel heading: "Review before analysis"
3. Descriptive line: "The following content was removed before sending to the LLM:"
4. If redactions found: list of categories and counts (e.g. "EMAIL — 3 removed", "API_KEY — 1 removed")
5. If no redactions: "No sensitive content detected in this log."
6. Two actions:
   - "Confirm and analyze" button (primary — proceeds to LLM analysis)
   - "Cancel and start over" button or link (secondary — resets pipeline to `idle`, upload form returns)

## Screen Elements

### Page heading

| Element | Notes |
|---|---|
| `<h1>Analyze Logs</h1>` | Rendered once at the top of the `/analysis` page content area in `AnalysisView` |

### Log source selector

| Element | Notes |
|---|---|
| "Upload File" tab/button | Active/selected state; clicking it has no visible effect (already selected) |
| "Loki Query" tab/button | Disabled (`disabled` attribute or `aria-disabled="true"`); shows a "Post-MVP" label or badge next to it |

Accessibility: tabs use `role="tablist"` / `role="tab"` with `aria-selected` and `aria-disabled` attributes.

### Drop zone (`FileUpload` component)

| Element | Notes |
|---|---|
| Drop zone container | Visually distinct bordered area; `min-h-40 rounded-lg border-2 border-dashed border-zinc-300`; idle state |
| Drag-over state | `border-teal-500 bg-teal-50` — teal border + tint while file is dragged over |
| Primary instruction | "Drag and drop your log file here" |
| Secondary action | `<label>` wrapping a hidden `<input type="file">` with visible text "or click to browse" |
| Accepted formats | ".log  .json  .ndjson" — displayed as text or tags |
| File size limit note | "Max {limit} MB" — use `VITE_MAX_LOG_SIZE_MB` env var; fall back to `10` if unset |
| Selected file display | File name (monospace) + formatted size + "Remove" (`×`) control; replaces the instruction text when a file is selected |
| Submit button | "Analyze logs" — disabled when no file selected; enabled when file is selected; disabled again while uploading |
| Upload error | `role="alert"` error message shown if upload API returns an error |

### Pipeline progress (`PipelineProgress` component)

| Element | Notes |
|---|---|
| Stage list | 4 key stages in order: **Fetching** → **Scrubbing** → **Analysing** → **Complete** |
| Active stage | Visually highlighted; shows an in-progress indicator |
| Completed stage | Shows a completion indicator (e.g. checkmark or tick) |
| Pending stage | Dimmed/muted |
| Hidden in `idle` state | Component renders nothing when pipeline is `idle` (already implemented) |

Note: the `awaiting-review` sub-state does not need its own visible stage row — it falls between Scrubbing and Analysing; the progress indicator pauses at Scrubbing complete until the user confirms.

### Redaction review panel (`RedactionReviewPanel` component)

| Element | Notes |
|---|---|
| Section heading | "Review before analysis" |
| Descriptive line | "The following content was removed before sending to the LLM:" |
| Redaction list | Each row: category name + count removed (e.g. "EMAIL — 3 removed") |
| Empty state | "No sensitive content detected in this log." — shown when `redactionSummary` is empty |
| "Confirm and analyze" button | Primary action; calls `onConfirm()`; disabled while confirming is in-flight |
| "Cancel and start over" | Secondary action; calls `onCancel()` to reset pipeline to `idle` |

Accessibility: section has `role="region"` and `aria-label="Redaction review"` (already implemented).

## Acceptance Criteria

1. **Given** I navigate to `/analysis`, **When** the page loads in `idle` state, **Then** I see the "Analyze Logs" heading, the log source selector, and the drop zone. The "Analyze logs" button is disabled.

2. **Given** I select a file, **When** the file is chosen, **Then** the drop zone shows the file name and size and the "Analyze logs" button becomes enabled.

3. **Given** a file is selected and I click "Analyze logs", **When** the upload starts, **Then** the `PipelineProgress` component appears showing "Fetching" as the active stage.

4. **Given** the upload and scrubbing have completed, **When** the pipeline is `awaiting-review`, **Then** the `RedactionReviewPanel` is visible with the heading "Review before analysis" and a "Confirm and analyze" button.

5. **Given** the `RedactionReviewPanel` shows redaction items, **When** I read the list, **Then** each row identifies the category and count of removed items.

6. **Given** the `RedactionReviewPanel` is visible and I click "Cancel and start over", **When** the action completes, **Then** the pipeline resets to `idle` and the upload form is shown again.

7. **Given** `VITE_OIDC_ENABLED` is not relevant here — the "Loki Query" source tab is always disabled in MVP; its `disabled` or `aria-disabled` attribute is set regardless of other config.

## Tasks / Subtasks

- [x] Task 1 — Polish `frontend/src/features/analysis/AnalysisView.tsx`
  - [x] Add `<h1>Analyze Logs</h1>` heading at the top of the rendered output (shown in all states)
  - [x] Add log source selector above `FileUpload` (shown only in `idle` state):
    - "Upload File" button — active, `aria-selected="true"`, `role="tab"`
    - "Loki Query" button — `disabled`, `aria-disabled="true"`, `role="tab"`, contains "Post-MVP" badge span
  - [x] Wire `onCancel` prop to `RedactionReviewPanel`: on cancel, dispatch `RESET` and clear `cacheId`, `jobId`, `redactionSummary`

- [x] Task 2 — Polish `frontend/src/features/analysis/FileUpload.tsx`
  - [x] Add drag-and-drop support: handle `onDragOver`, `onDrop` events on the drop zone container; add a drag-active CSS class (or inline style) while a file is being dragged over
  - [x] Show selected file info (name + formatted size using `Intl.NumberFormat` or manual KB/MB conversion) when a file is selected; add a "×" remove button that clears the selection
  - [x] Disable submit button when no file is selected; enable when a file is chosen
  - [x] Show accepted formats: ".log  .json  .ndjson"
  - [x] Show file size limit note using `import.meta.env.VITE_MAX_LOG_SIZE_MB ?? '10'`
  - [x] `<input type="file" accept=".log,.json,.ndjson">` — restrict to accepted formats
  - [x] Show upload error with `role="alert"` when the API returns an error

- [x] Task 3 — Polish `frontend/src/features/analysis/RedactionReviewPanel.tsx`
  - [x] Add "Review before analysis" `<h2>` heading
  - [x] Add descriptive line: "The following content was removed before sending to the LLM:"
  - [x] Change list row format to `{TYPE} — {count} removed`
  - [x] Add `onCancel` prop: `onCancel?: () => void`; render a "Cancel and start over" button that calls `onCancel()`
  - [x] `disabled` prop passed to both buttons while confirmation is in-flight (already has `disabled` on confirm; add to cancel too)

- [x] Task 4 — Update `RedactionReviewPanel.test.tsx`
  - [x] Add test: "Cancel and start over" button calls `onCancel` when clicked

## Test Scenarios

*Unit (Vitest + React Testing Library):*
- `FileUpload`: "Analyze logs" button is disabled when no file is selected
- `FileUpload`: shows file name and size after file selection
- `FileUpload`: "×" remove button clears the selected file and re-disables the submit button
- `FileUpload`: displays accepted formats and size limit note
- `RedactionReviewPanel`: renders "Review before analysis" heading
- `RedactionReviewPanel`: renders category rows as "{TYPE} — {count} removed"
- `RedactionReviewPanel`: "Cancel and start over" button calls `onCancel` when clicked

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Navigating to `/analysis` shows the upload drop zone and a disabled "Analyze logs" button
- After selecting a file, "Analyze logs" becomes enabled
- After upload and scrubbing, the redaction review panel appears with a "Confirm and analyze" button (existing test — must continue to pass)
- Clicking "Cancel and start over" on the review panel resets to the upload drop zone
