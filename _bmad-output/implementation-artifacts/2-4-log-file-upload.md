# Story 2.4: Log file upload

Status: done

## Story

As a user,
I want to upload a local log file in `.log`, `.json`, or `.ndjson` format for analysis,
So that I can analyse logs from systems that are not connected to a Grafana/Loki instance.

## Acceptance Criteria

**AC1 — Upload accepted and routed to scrubbing:**
**Given** I select source type "File Upload" in the log source selector,
**When** I choose a `.log`, `.json`, or `.ndjson` file,
**Then** the file is sent via multipart form POST to `POST /api/v1/logs/upload` and enters the scrubbing pipeline on acceptance.

**AC2 — Oversized uploads rejected early:**
**Given** the uploaded file exceeds `MAX_LOG_SIZE_MB`,
**When** Fastify processes the multipart upload,
**Then** it returns RFC 7807 `413 Payload Too Large` before reading the full file body.

**AC3 — Structured parsing for `.json` and `.ndjson`:**
**Given** a `.json` or `.ndjson` file is uploaded,
**When** the content is parsed,
**Then** log lines are extracted from the structured format; if the file is malformed, a clear RFC 7807 error is returned and no content is cached.

**AC4 — Unsupported file types blocked client-side:**
**Given** an unsupported file type is selected (e.g., `.csv`),
**When** the upload is submitted,
**Then** client-side validation rejects the file and no request is sent.

**AC5 — File upload is the only MVP source type:**
**Given** the log source selector is rendered with all three source types available,
**When** I view the selector,
**Then** "File Upload" is the only available source type in MVP; the selector defaults to file upload without a source-type choice UI.

## Tasks / Subtasks

- [x] Task 1 — Multipart upload route (AC1, AC2, AC3)
  - [x] Create `api/src/routes/logs.ts` with `POST /api/v1/logs/upload`
    - Use `@fastify/multipart` and a file size limit derived from `MAX_LOG_SIZE_MB`
    - Accept file fields for `.log`, `.json`, and `.ndjson`
    - Read uploaded content, parse structured formats, and forward normalized text into the existing scrubbing flow from Story 3.1
    - Return RFC 7807 errors for malformed content and over-limit uploads
  - [x] Register `logsRoute` in `api/src/app.ts`

- [x] Task 2 — File parsing helpers (AC3)
  - [x] Create `api/src/services/logFileParser.ts` with helpers for:
    - `.log` raw line splitting
    - `.json` array extraction
    - `.ndjson` line-by-line JSON parsing
  - [x] Ensure malformed `.json` and `.ndjson` inputs raise clear parse errors with file context

- [x] Task 3 — Frontend file upload UI (AC1, AC4, AC5)
  - [x] Create `frontend/src/features/analysis/FileUpload.tsx`
    - Default to file upload without a source-type chooser
    - Accept only `.log`, `.json`, `.ndjson`
    - Reject unsupported extensions client-side before network submission
    - Submit file via multipart form POST to `/api/v1/logs/upload`
  - [x] Add upload API helper in `frontend/src/features/analysis/analysisApi.ts`
    - `uploadLogFile(file: File): Promise<...>` using `FormData`
  - [x] Wire the uploader into the analysis entry point / source selector so file upload is the only MVP source type

- [x] Task 4 — Unit tests (AC2, AC3, AC4, AC5)
  - [x] `api/src/services/logFileParser.test.ts`
    - `.log` split behavior
    - valid `.json` array extraction
    - valid `.ndjson` extraction
    - malformed `.json` and `.ndjson` errors
  - [x] `api/src/routes/logs.test.ts`
    - multipart route rejects unsupported content and oversized payloads
    - valid `.log` and `.ndjson` are accepted and normalized
  - [x] `frontend/src/features/analysis/FileUpload.test.tsx`
    - unsupported file extensions are rejected client-side
    - valid files submit through multipart form data

- [x] Task 5 — Integration tests (AC1, AC2, AC3)
  - [x] `api/src/routes/logs.integration.test.ts`
    - `.log` upload accepted and forwarded into the scrubbing flow
    - `.ndjson` upload accepted and normalized
    - oversized upload returns RFC 7807 413
    - malformed `.json` returns RFC 7807 422

- [x] Task 6 — E2E tests (AC1, AC4, AC5)
  - [x] Create `e2e/analysis.spec.ts`
    - upload `fixtures/sample.log`; verify pipeline enters scrubbing stage
    - attempt `.csv` upload; verify client-side rejection with no network request

## Dev Notes

### Context and constraints

Story 2.4 is the first MVP work in Epic 2 and depends on the auth/setup/security foundation already created in Epic 1. The upload flow must fit the existing Fastify + TanStack Router SPA, use the current multipart-friendly API pattern, and feed into the scrubbing pipeline introduced in Story 3.1.

### Existing implementation patterns to preserve

- Use the current Fastify app composition in [api/src/app.ts](api/src/app.ts) rather than creating a separate upload server.
- Preserve the existing `apiGet` / `apiPost` fetch wrapper style in [frontend/src/lib/apiClient.ts](frontend/src/lib/apiClient.ts); add a multipart helper only if needed.
- Keep the router code-based in [frontend/src/router.tsx](frontend/src/router.tsx) and follow the existing guard pattern.
- Maintain RFC 7807-style error responses via `@fastify/sensible`.

### Story-specific technical requirements

- Multipart uploads should use `@fastify/multipart` and enforce the file-size limit server-side before buffering the whole file.
- Structured `.json` uploads should accept arrays of log entries and reject non-array JSON.
- Structured `.ndjson` uploads should parse line by line and identify malformed line numbers in error responses.
- Client-side validation should reject unsupported extensions before any network request is made.
- MVP only exposes file upload as a source type; do not introduce a UI chooser for Loki or named sources yet.

### Files to read before implementation

| File | Why it matters |
|------|----------------|
| `api/src/app.ts` | Route registration order and middleware stack |
| `api/src/routes/health.ts` | Existing Fastify route style and RFC 7807 error conventions |
| `frontend/src/router.tsx` | Current analysis entry point and route guard patterns |
| `frontend/src/lib/apiClient.ts` | Existing fetch wrapper and CSRF handling |
| `frontend/src/features/auth/LoginForm.tsx` | Current frontend component style and form handling |

### Implementation guardrails

- Do not build a second parsing stack in the frontend; the backend must own normalization and validation.
- Do not add Post-MVP data source selection UI in this story.
- Do not bypass the existing scrubbing flow; the upload route should hand off normalized text into the same downstream path used by future analysis sources.
- Keep error messages specific enough for debugging but use RFC 7807 shape for API responses.

### Testing guardrails

- Unit tests should cover parser edge cases directly and should not depend on real file uploads.
- Integration tests should cover multipart behavior with a real Fastify test instance.
- E2E tests should verify the file picker behavior and upload trigger path from the UI.

### Dev Agent Record

#### Context summary
- Epic 1 stories 1.1, 1.3, 1.4, and 1.6 are in `review`.
- Story 1.2 is `done`.
- Next MVP story selected from the sprint is Story 2.4, since 2.1 and 2.2 are explicitly Post-MVP.

#### Notes for implementation
- Reuse existing auth/CSRF/session patterns; the upload endpoint will eventually need to participate in them.
- Keep the frontend uploader small and isolated so it can be plugged into the future analysis pipeline UI.

### File List

#### To be created
- `api/src/routes/logs.ts`
- `api/src/services/logFileParser.ts`
- `api/src/routes/logs.test.ts`
- `api/src/routes/logs.integration.test.ts`
- `api/src/services/logFileParser.test.ts`
- `frontend/src/features/analysis/FileUpload.tsx`
- `frontend/src/features/analysis/FileUpload.test.tsx`
- `frontend/src/features/analysis/analysisApi.ts`
- `e2e/analysis.spec.ts`

#### To be updated
- `api/src/app.ts`
- `frontend/src/router.tsx`
- `frontend/src/lib/apiClient.ts`

### Change Log

- 2026-04-28: Created Story 2.4 from Epic 2 MVP backlog and aligned it with the current authenticated Fastify/React codebase.

### Review Findings

- [x] [Review][Patch] P1 — FST_FILES_LIMIT (too many files) incorrectly mapped to 413 Payload Too Large — correct status is 400; with default limits.files=1, sending two files returns 413 instead of 400 [api/src/routes/logs.ts — req.file() catch]
- [x] [Review][Patch] P2 — 422 parse-error body missing RFC 7807 fields — returns plain { message, lineNumber }, not @fastify/sensible envelope { statusCode, error, message } (AC3 violation) [api/src/routes/logs.ts]
- [x] [Review][Patch] P3 — No unit test for 413 oversized-file path — AC2 primary DoS mitigation has zero unit test coverage [api/src/routes/logs.test.ts]
- [x] [Review][Patch] P4 — Unsupported-extension path drains stream via toBuffer() — allocates full MAX_LOG_SIZE_MB buffer only to discard; use data.file.resume() instead [api/src/routes/logs.ts]
- [x] [Review][Patch] P5 — parseLogFile unsupported-extension branch throws ParseError caught as 422 — if route and parser extension lists diverge a type rejection returns 422 instead of 415 [api/src/services/logFileParser.ts]

- [x] [Review][Defer] D1 — scrubCache.set failure unhandled — deferred, already in deferred-work.md from story 3.1 review
- [x] [Review][Defer] D2 — Empty file sends empty string to scrubber — deferred, already in deferred-work.md from story 3.1 review

### Status

done
