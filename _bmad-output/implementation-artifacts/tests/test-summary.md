# Test Summary

Generated: 2026-04-28

## Unit & Integration Tests

### API (`api/`) — Vitest

| Test File | Tests |
|---|---|
| src/config/env.test.ts | 7 |
| src/app.test.ts | 2 |
| src/routes/logs.test.ts | 7 |
| src/plugins/csrf.test.ts | 5 |
| src/routes/auth.test.ts | 6 |
| src/db/migrate.test.ts | 3 |
| src/plugins/helmet.test.ts | 4 |
| src/routes/setup.test.ts | 6 |
| src/services/scrubService.test.ts | 8 |
| src/routes/health.test.ts | 5 |
| src/plugins/auth.test.ts | 3 |
| src/services/llmProvider.test.ts | 11 |
| src/services/logFileParser.test.ts | 15 |
| src/services/setupService.test.ts | 6 |
| src/services/scrubCache.test.ts | 6 |
| src/services/analysisOutputSchema.test.ts | 8 |
| src/services/authService.test.ts | 3 |
| **Total** | **131 passing** |

Run: `pnpm test` in `api/`

### Frontend (`frontend/`) — Vitest

| Test File | Tests |
|---|---|
| src/features/analysis/useAnalysisPipeline.test.ts | 11 |
| src/features/analysis/useAnalysisStream.test.tsx | 8 |
| src/features/analysis/PipelineProgress.test.tsx | 7 |
| src/features/analysis/FileUpload.test.tsx | 4 |
| src/features/analysis/CancelButton.test.tsx | 9 |
| src/features/analysis/AnalysisOutput.test.tsx | 10 |
| **Total** | **49 passing** |

Run: `npx vitest run` in `frontend/`

---

## End-to-End Tests

Framework: Playwright · Config: `e2e/playwright.config.ts` · Base URL: `http://localhost:8080`

Run: `npx playwright test` in `e2e/` (requires full docker stack via `docker compose -f docker-compose.dev.yml up`)

### `e2e/auth.spec.ts`

| Suite | Test | Stories |
|---|---|---|
| Authentication | first-run wizard renders setup form | 1.3 |
| Authentication | login with valid credentials succeeds | 1.4 |
| Authentication | login with invalid credentials shows error | 1.4 |
| Authentication | logout clears session | 1.4 |

### `e2e/analysis.spec.ts`

| Suite | Test | AC / Stories |
|---|---|---|
| Log file upload | /analysis renders upload form without source-type chooser | story-2.4 AC5 |
| Log file upload | uploading .log fixture triggers POST to /api/v1/logs/upload | story-2.4 AC1 |
| Log file upload | selecting .csv shows client-side rejection without network request | story-2.4 AC4 |
| Analysis pipeline — full journey | pipeline transitions through all stages and streams tokens | story-4.3, 5.1 |
| Analysis pipeline — full journey | fetching stage label "Fetching logs…" appears after submission | story-5.1 AC2 |
| Structured analysis output | all four output sections visible after analysis completes | story-4.4 |
| Structured analysis output | "AI-generated — not authoritative" label visible | story-4.4 AC5 |
| Structured analysis output | confidence indicator present in root cause section | story-4.4 AC3 |
| Recommended next steps | "Recommended Next Steps" section visible after analysis completes | story-4.5 AC1 |
| Recommended next steps | AI disclaimer banner has no dismiss/close button | story-4.5 AC4 |
| In-flight analysis cancellation | Cancel button visible during active analysis; clicking transitions to cancelled state | story-5.2 AC1, AC3 |
| In-flight analysis cancellation | Cancel button not visible when pipeline is idle | story-5.2 AC4 |
| Non-blocking UI during analysis | navigating away during active analysis does not freeze the page | story-5.3 AC1, AC2 |

---

## Story Coverage

| Story | Unit/Integration coverage | E2E coverage |
|---|---|---|
| 1.1 Docker compose stack | env validation tests | — |
| 1.2 Database schema & health | migrate tests, health route tests | — |
| 1.3 First-run setup wizard | setup route/service tests | auth.spec.ts |
| 1.4 Username/password login | auth plugin/service/route tests | auth.spec.ts |
| 1.6 HTTP security headers & CSRF | helmet + csrf plugin tests | — |
| 2.4 Log file upload | logs route tests | analysis.spec.ts |
| 3.1 PII scrubbing before LLM | scrubService tests | — |
| 3.2 NER-based PII detection | scrubService tests | — |
| 4.1 LLM provider configuration | llmProvider tests | — |
| 4.3 Analysis pipeline | analysisOutputSchema tests | analysis.spec.ts |
| 4.4 Structured analysis output | analysisOutputSchema tests | analysis.spec.ts |
| 4.5 Recommended next steps | analysisOutputSchema tests | analysis.spec.ts |
| 5.1 Pipeline progress indicators | PipelineProgress, useAnalysisPipeline tests | analysis.spec.ts |
| 5.2 In-flight cancellation | CancelButton tests | analysis.spec.ts |
| 5.3 Non-blocking UI | useAnalysisStream tests | analysis.spec.ts |
