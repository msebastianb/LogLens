# Deferred Work

## Deferred from: large-file chunking implementation in story 4.3 (2026-05-15)

- D1 — `js-tiktoken` tokenizer is initialised at module scope in `api/src/routes/analysis.ts` (`PROMPT_OVERHEAD_TOKENS = countPromptTokens(buildChunkPromptForBudget(''))`) — this executes synchronously during module load, adding a small startup cost (~50ms). Consider lazy-initialising behind a getter if startup time becomes a concern.
- D2 — Single lines that individually exceed `ANALYSIS_MAX_CHUNK_TOKENS` are pushed as oversized single-line chunks rather than byte-split. The LLM will see a slightly over-budget prompt. A future story could byte-split oversized lines at UTF-8 character boundaries.
- D3 — Token count per line uses `countPromptTokens(segment)` which measures the segment in isolation; cross-boundary tokenisation effects (rare at GPT-style BPE) may cause the assembled chunk to slightly over- or under-count. The 2% safety margin in `splitLogIntoChunks` mitigates this.

## Deferred from: code review of 1-1-docker-compose-stack-with-per-service-env-validation (2026-04-28)

- D1 — nginx service has no Docker healthcheck — AC1 "reaches healthy state" technically unverifiable — non-breaking
- D2 — JWT_SECRET Zod validation checks length not entropy — 32-char weak secret passes validation
- D3 — Pydantic scrubber/config.py has no required fields — AC3 is vacuously satisfied
- D4 — Migration failure logged with console.error not Fastify structured logger — Fastify not yet initialized at migration time

## Deferred from: code review of 1-2-database-schema-migration-and-health-check (2026-04-28)

- D1 — AC2: migration failure causes process.exit(1) before health endpoint exists — architectural constraint, callers get ECONNREFUSED not 503
- D2 — system_settings.updatedAt never auto-updates on UPDATE — no trigger, needs DB migration to fix
- D3 — data_sources.authConfig stores credentials as unencrypted plaintext — encryption planned Story 2.x
- D4 — data_sources.url can embed credentials in connection string — same as D3
- D5 — No SIGTERM/SIGINT graceful shutdown for pool or redis — pre-existing cross-cutting concern
- D6 — health.integration.test.ts imports buildApp at module scope creating dangling connections — test quality concern

## Deferred from: code review of 1-3-first-run-setup-wizard (2026-04-28)

- D1 — AC3 maps to 409 conflict; AC specifies redirect to /login — redirect is frontend responsibility
- D2 — Username accepts control characters and Unicode confusables — no security impact in storage context
- D3 — No rate limiting on POST /setup — pre-existing gap across endpoints

## Deferred from: code review of 1-4-username-password-login-and-logout (2026-04-28)

- D1 — JWT not blocklisted on logout — captured token reusable until expiry — Redis blocklist is architectural addition
- D2 — Rate limiting per-IP only, no per-username throttle — systemic enhancement
- D3 — Logout not CSRF-protected — covered by story 1.6 CSRF plugin POST mutation hooks
- D4 — No audit log for login/logout events — observability enhancement
- D5 — No max password length in loginBodySchema — same bcrypt truncation concern as story 1.3

## Deferred from: code review of 1-6-http-security-headers-and-csrf-protection (2026-04-28)

- D1 — HSTS not explicitly configured in helmetPlugin — relies on helmet default; stable across current major version

## Deferred from: code review of 2-4-log-file-upload (2026-04-28)

- D1 — scrubCache.set failure unhandled — already deferred in story 3.1 review
- D2 — Empty file sends empty string to scrubber — already deferred in story 3.1 review

## Deferred from: code review of 3-1-automatic-pii-and-secrets-scrubbing-before-llm-submission (2026-04-28)

- D1 — RFC 7807 fields (type/title/status/detail) missing on 502/504 responses in logs.ts — pre-existing pattern, 422 also uses plain {message}
- D2 — Unbounded DEL spread in scrubCache.deleteAll — no batch cap on redis.del args — pre-existing from Story 1.4
- D3 — No rate limiting on the upload endpoint — pre-existing across all endpoints
- D4 — 30s default SCRUBBER_TIMEOUT_MS too large for an interactive upload endpoint — operator configuration choice
- D5 — File extension validated by client-controlled filename not MIME/magic bytes — pre-existing from Story 2.4
- D6 — Triple memory buffering (buffer + content + rawText coexist in handler) — pre-existing from Story 2.4
- D7 — No auth between API and scrubber service (no mTLS / shared secret) — architecture-level decision
- D8 — Scrubber response body not size-guarded before res.json() — low risk on internal Docker network
- D9 — redis.del/scan errors not caught in deleteAll loop — pre-existing from Story 1.4

## Deferred from: code review of 3-2-ner-based-pii-detection (2026-04-28)

- D1 — Entities with identical start positions — sort stability preserves order but behaviour undocumented and untested — rare model edge case
- D2 — Empty entity_group produces [REDACTED_NONE] / [REDACTED_] — str().upper() does not crash, just ugly output
- D3 — Pipeline returning non-list — transformers.pipeline always returns list for token-classification; low risk
- D4 — Pipeline exception propagates as opaque 500 — FastAPI default error handling acceptable for internal service
- D5 — No max payload size on ScrubRequest — MAX_LOG_SIZE_MB enforced by Fastify upstream; scrubber is internal-only
- D6 — Unicode/multibyte character handling untested — depends on tokenizer alignment; deferred pending real-world testing
- D7 — Concurrent request safety untested — transformers pipeline thread safety; architecture-level concern
- D8 — Sorting assertion weak in test_scrub_summary_sorted_ascending_by_start — low risk, functional coverage sufficient

## Deferred from: code review of 3-3-pattern-based-secrets-detection (2026-04-28)

- D1 — `default_settings()` concurrency: detect-secrets mutates global plugin settings state per scrub() call; not safe under concurrent requests in a multi-worker deployment — architecture-level concern
- D2 — `start`/`end` in SecretsScanner redaction_summary items are offsets into post-PF intermediate text, not original text — undocumented API behaviour; low caller impact in current single-consumer usage

## Deferred from: code review of 3-4-custom-regex-patterns-for-organisation-specific-sensitive-data (2026-04-28)

- D1 — `scrubText()` signature change `(text, signal?)` → `(text, options?, signal?)` silently drops AbortSignal if passed as second arg — no current callers affected; document or restore signal overload when needed
- D2 — `ScrubValidationError.detail` stored but never surfaced to the route handler caller — dead field; remove or expose if richer error messages are desired

## Deferred from: code review of 4-1-llm-provider-configuration (2026-04-28)

- ~~D1 — Model hardcoded as `gpt-4o` in `BaseStreamProvider` request body~~ **RESOLVED 2026-04-30:** `LLM_MODEL` env var added (default `gpt-5.4-mini`); both `OpenAIProvider` and `OpenAICompatibleProvider` now pass model to `super()` constructor
- D2 — `llmProviderFactory(env)` called per-request in `analysis.ts` (result discarded) — provider instance should be created once at startup and reused; Story 4.3 concern when streaming is wired
- D3 — Empty string token `""` filtered by `if (token)` in SSE parser — correct per OpenAI spec but worth noting for edge providers
- D4 — Partial buffer silently discarded if stream closes without `[DONE]` — network-interruption edge case; acceptable for current usage

## Deferred from: code review of 5-2-in-flight-analysis-cancellation (2026-04-28)

- D1 — AbortController leaks in `jobControllers` Map if `redis.set` fails in POST — no client receives the jobId so the orphaned controller is unreachable; server restart clears it; infrastructure-level failure path not worth guarding

## Deferred from: code review of 5-3-non-blocking-ui-during-long-running-operations (2026-04-28)

- D1 — Stale `outputRef.current` between jobId change and next effect — inherent React effect timing; callers must not read ref synchronously during a render triggered by jobId prop change
- D2 — Stale closure risk when unstable callbacks passed to `useAnalysisStream` — accepted React pattern; eslint-disable comment documents intent; caller responsibility to wrap in useCallback/dispatch
- D3 — Native EventSource connection-error (`onerror`) not handled — connection drops degrade silently with no `onError` call; track for future hardening

## Deferred from: code review of 5-5-analysis-view-and-redaction-review-panel (2026-04-29)

- D1 — Dual CSRF token caches: `fetchCsrfToken` in `analysisApi.ts` calls `apiGet` independently from `apiClient.ts`'s internal `getCsrfToken` cache — on cold start both may each issue a separate `/api/v1/csrf/token` request; pre-existing pattern from story-2.4

## Deferred from: code review of 6-1-application-shell-and-authenticated-navigation-layout (2025-07-10)

- D1 — `getMe()` called in route `beforeLoad` guards bypasses React Query `['me']` cache — each protected route navigation fires an independent network request; hoisting auth to a shared parent route context would be the correct architectural fix; pre-existing pattern from Epic 1
