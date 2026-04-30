---
stepsCompleted: [step-01-init, step-02-context, step-03-starter, step-04-decisions, step-05-patterns, step-06-structure, step-07-validation, step-08-complete]
status: 'complete'
completedAt: '2026-04-27'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-nf-project.md
  - _bmad-output/planning-artifacts/product-brief-nf-project-distillate.md
workflowType: 'architecture'
project_name: 'nf-project (LogLens)'
user_name: 'Sebastian'
date: '2026-04-27'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
38 FRs across 7 capability areas: Log Source & Ingestion (FR1–6), Privacy Scrubbing Pipeline (FR7–14), LLM Provider Configuration (FR15–18), Log Analysis & Output (FR19–25), Authentication & Access (FR26–30), Deployment & Configuration (FR31–34), Analysis UX & Workflow (FR35–38).

The scrubbing pipeline (FR7–14) is the architectural gate: a server-side process (pattern-based secrets detection + custom regex, with optional NER model) that raw log content cannot bypass before reaching an LLM. NER-based PII detection is opt-in via `NER_ENABLED=true` (disabled by default for CPU-only deployments where inference is impractically slow). The session cache (FR13–14) stores only scrubbed content, never raw logs, and is invalidated on session end (FR30).

Log ingestion has two paths (FR1, FR4): direct server-to-Loki (Post-MVP) and file upload (FR4). Both paths feed the same scrubbing pipeline identically.

LLM provider abstraction (FR15–18) must support remote APIs (OpenAI, Anthropic, any OpenAI-compatible) and fully local (LM Studio) with streaming output (FR18) and zero-egress guarantee in local mode (FR17). Large logs that exceed the model’s context window are automatically split into chunks, analysed independently, then merged via a final LLM consolidation pass — no log truncation.

**Non-Functional Requirements driving architecture:**
- Privacy Filter model eager-loaded at startup when `NER_ENABLED=true` — no cold starts; 4GB RAM minimum when NER enabled; 1GB sufficient when disabled (default)
- NER disabled by default (`NER_ENABLED=false`) — CPU inference at ~134 chars/sec is impractical for production use without GPU
- LLM first token ≤ 5s; streaming to UI via SSE or WebSocket
- Analysis completion < 60s for 10k-line log file
- CSRF protection on all non-localhost state-mutating endpoints; CSP headers; credentials never in logs
- Session cache: no cross-user access; read-only container FS except defined ephemeral volumes
- Configurable timeouts on all external calls; no unbounded blocking operations

**Scale & Complexity:**
- Primary domain: full-stack web — SPA + containerised polyglot backend (Node.js + Python)
- Complexity: medium-high
- Estimated architectural components: 5 (Nginx, Fastify API, FastAPI scrubber, React SPA, PostgreSQL)

### Technical Constraints & Dependencies

- Privacy Filter (1.5B param Hugging Face Transformers model) requires Python/PyTorch — cannot run natively in Node.js
- Docker Compose multi-service deployment (FR32); each service runs in its own container
- FastAPI scrubber container not port-mapped externally — reachable only via internal Docker Compose service network
- Container must support read-only FS mounts except ephemeral cache and log volumes
- No persistent log storage — scrubbed log cache is in-memory only (Map on Fastify server)

### Cross-Cutting Concerns Identified

- **Security/privacy boundary enforcement** — scrubbing pipeline is a mandatory gate; credential redaction in all error paths; session isolation
- **Async pipeline orchestration** — all three stages (fetch, scrub, LLM) must be cancellable and report per-stage progress to UI
- **LLM provider abstraction** — single interface over OpenAI, Anthropic, any OpenAI-compatible API, and LM Studio
- **Session lifecycle management** — JWT expiry must invalidate in-memory scrub cache; no cross-user leakage

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application — polyglot multi-container Docker Compose stack. No single scaffold covers this stack; each layer is initialised separately. Docker Compose is the unit of deployment.

### Stack Architecture

```
Docker Compose network: loglens_net

┌──────────────┐     ┌──────────────────────────────┐
│  nginx:80/443│────▶│  api (Fastify Node 22 :3000)  │
│  Nginx 1.27  │     │  - auth, Loki, LLM, WebSocket │
│  SPA static  │     │  - auth, Loki (Post-MVP), LLM│
│  TLS termination│  │  → scrubber:8001 (internal)   │
└──────────────┘     │  → postgres:5432              │
                     │  → redis:6379                 │
                     └──────────────────────────────┘
                              │
                     ┌────────▼─────────────────────┐
                     │ scrubber (FastAPI Python :8001)│
                     │ Privacy Filter + detect-secrets│
                     │ No external port mapping      │
                     └───────────────────────────────┘

┌──────────────┐     ┌──────────────────────────────┐
│  postgres:5432│    │  redis:6379                   │
│  PostgreSQL 17│    │  Redis 7 (no persistence)     │
└──────────────┘     └──────────────────────────────┘
```

### Initialization Commands

**Frontend (React + Vite):**
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
npm install @tanstack/react-query @tanstack/react-router tailwindcss
```

**Backend API (Fastify):**
```bash
mkdir api && cd api && npm init -y
npm install fastify @fastify/cors @fastify/cookie @fastify/jwt \
  @fastify/multipart @fastify/websocket @fastify/rate-limit \
  pg drizzle-orm zod
npm install -D typescript tsx vitest @types/node drizzle-kit
```

**Scrubbing Service (FastAPI):**
```bash
mkdir scrubber && cd scrubber
pip install fastapi "uvicorn[standard]" transformers torch \
  detect-secrets pydantic
```

### Architectural Decisions Established

**Language & Runtime:**
- Node.js 22 LTS + TypeScript strict — Fastify API server
- Python 3.12 — FastAPI scrubbing service; required for PyTorch/Transformers (Privacy Filter model cannot run natively in Node.js)

**Container Deployment (Docker Compose):**
- Five services: `nginx`, `api` (Fastify), `scrubber` (FastAPI), `postgres`, `redis`
- Each service has its own `Dockerfile`; built via `docker compose build`
- `scrubber` service has no `ports:` mapping — reachable only via `loglens_net` internal network as `http://scrubber:8001`
- `nginx` builds the React SPA during its Docker build stage and serves the compiled dist

**Reverse Proxy:**
- Nginx 1.27 serves compiled SPA from `/app/frontend/dist`
- `/api/*` and `/ws/*` proxied to Fastify `:3000`
- TLS termination at Nginx; HTTP only on `localhost`

**API Framework:**
- Fastify v5 — async-native, schema-first JSON Schema validation, plugin architecture
- Plugins: `@fastify/cors`, `@fastify/cookie`, `@fastify/jwt`, `@fastify/multipart` (file upload), `@fastify/websocket` (Loki tail), `@fastify/rate-limit`
- Auth tokens: httpOnly signed JWTs (issued after OIDC callback or password login); no server-side session table needed
- Scrubbed log cache: in-memory `Map<userId, ScrubCache>` on Fastify server, cleared on JWT expiry or explicit logout

**Scrubbing Service:**
- FastAPI 0.115 + Uvicorn ASGI
- Pydantic v2 for request/response validation
- NER-based PII detection disabled by default (`NER_ENABLED=false`); when enabled, Privacy Filter model loaded at startup via `transformers.pipeline()` — always warm
- Pattern-based secrets detection (detect-secrets) and custom regex always active regardless of NER setting
- Single endpoint: `POST /scrub` → returns `{ redacted_text, redaction_summary }`

**Database (PostgreSQL 17 + Drizzle ORM):**
- Persists: named data source configs, user records (password auth), first-run wizard state
- Scrubbed log cache is NOT in PostgreSQL — in-memory only (Map on Fastify), per PRD security constraint
- Drizzle ORM: TypeScript-native, SQL-like API, schema-as-code migrations via `drizzle-kit`

**Frontend:**
- React 19 + Vite 6, TypeScript strict
- TanStack Query v5 — async state for pipeline stages, LLM streaming, cancellation
- TanStack Router v1 — type-safe SPA routing
- Tailwind CSS v4 — utility-first; no component library for v1 (redaction review and pipeline progress UIs are bespoke)

**Testing:**
- Vitest — unit + integration tests (Fastify API, React components)
- pytest — unit tests for FastAPI scrubbing service (critical: reference secret recall suite)
- Playwright — E2E tests (auth flows, full analysis pipeline)

### Repository Structure

```
/
├── frontend/          # React + Vite SPA
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       └── lib/
├── api/               # Fastify Node.js API server
│   └── src/
│       ├── routes/
│       ├── plugins/
│       ├── services/  # llm-provider/, loki-client/, scrub-cache/
│       └── db/        # Drizzle schema + migrations
├── scrubber/          # FastAPI Python scrubbing service
│   ├── main.py
│   ├── pipeline/      # privacy_filter.py, detect_secrets.py, regex.py
│   └── tests/
├── nginx/             # nginx.conf template (env-var substitution)
├── docker/
│   ├── supervisord.conf
│   └── Dockerfile
├── docker-compose.yml
└── docker-compose.dev.yml
```

**Note:** No single scaffold bootstraps the full stack. First implementation stories should initialise each layer independently then wire them in the container.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Redis as scrubbed-log session cache (replaces in-memory Map)
- SSE for LLM streaming; WebSocket for Loki tail
- `openid-client` for OIDC integration
- RFC 7807 Problem Details as API error format
- 10 MB default log size limit (`MAX_LOG_SIZE_MB` env var)

**Important Decisions (Shape Architecture):**
- PostgreSQL `system_settings` table for first-run wizard state
- Redis configured with no disk persistence (satisfies PRD "no log data to disk" constraint)
- JWT expiry and Redis TTL kept in sync

**Deferred Decisions (Post-MVP):**
- Redis clustering / persistence for non-log data (Phase 2, when team scrubbing rule configs need sharing)
- RBAC model (Phase 2 per PRD scoping)

### Data Architecture

**Primary Persistence — PostgreSQL 17:**
- `users` table: id, username, password_hash (bcrypt), created_at — password auth mode only
- `data_sources` table: id, user_id, name, url, auth_type, auth_config (encrypted at rest), created_at
- `system_settings` table: key (PK), value, updated_at — stores first-run completion flag, OIDC configuration state
- Migrations managed by `drizzle-kit`; migration files committed to repository
- No log content ever written to PostgreSQL

**Session Cache — Redis 7 (in-memory only, no persistence):**
- Required start flags: `--save "" --appendonly no` — ensures zero disk writes; satisfies PRD security constraint
- Key scheme: `scrub_cache:{userId}:{sessionId}` → `{ redacted_text, redaction_summary, source_metadata }`
- TTL: set to match JWT expiry (configurable, default 8 hours via `SESSION_TTL_SECONDS` env var)
- On logout: `DEL scrub_cache:{userId}:{sessionId}` called explicitly
- Redis is a separate container in docker-compose; for Kubernetes, a sidecar or shared Redis service
- Redis must NOT be exposed outside the container network

**Data Validation:**
- Fastify: JSON Schema validation via Ajv on all route inputs (built into Fastify)
- Zod schemas for internal TypeScript type safety and runtime validation of env vars at startup
- Pydantic v2 for FastAPI scrubber request/response validation

### Authentication & Security

**Authentication Flow:**
- **OIDC mode** (when `OIDC_ISSUER_URL` env var is set): `openid-client` handles discovery, authorization code flow with PKCE, token validation; Fastify issues its own httpOnly JWT after successful OIDC callback
- **Password mode** (when no OIDC configured): first-run wizard sets bcrypt-hashed admin password in PostgreSQL `users` table; Fastify issues httpOnly JWT on password verification
- First-run state tracked in `system_settings`; if `first_run_complete = false` and no OIDC config, redirect to wizard
- JWTs: httpOnly, `Secure` flag on non-localhost, `SameSite=Strict`; signed with `JWT_SECRET` env var (min 32 bytes, validated at startup)
- No server-side session table; JWT is the session token

**Security Middleware (Fastify plugins):**
- `@fastify/helmet` — sets CSP, X-Frame-Options, X-Content-Type-Options headers
- `@fastify/csrf-protection` — CSRF tokens for all state-mutating endpoints on non-localhost
- `@fastify/rate-limit` — rate limiting on auth endpoints (login, OIDC callback) to prevent brute force
- Credential scrubbing hook: Fastify `onError` hook redacts any string matching known credential patterns from error responses and logs

### API & Communication Patterns

**API Design — REST + Streaming:**
- REST JSON for all CRUD operations (data sources, auth, first-run wizard, analysis submission)
- All routes prefixed `/api/v1/`
- Error responses: RFC 7807 Problem Details (`{ type, title, status, detail, instance? }`) via `@fastify/sensible`
- No GraphQL for v1 — REST is sufficient, simpler to secure, easier for AI agents to reason about

**LLM Streaming — Server-Sent Events (SSE):**
- Fastify route `GET /api/v1/analysis/:id/stream` returns `text/event-stream`
- Tokens forwarded as `data: { token: "..." }` events; pipeline stage changes as `event: stage` messages
- Final event: `event: complete` with full structured JSON payload
- Cancel: `DELETE /api/v1/analysis/:id` aborts the in-flight LLM call and clears pipeline state
- Default model: `gpt-5.4-mini` (400K context window, 128K max output tokens) — configurable via `LLM_MODEL` env var

**Chunked Analysis (large logs):**
- Logs exceeding the model's context window (MAX_CHUNK_CHARS = 1,570,000 chars ≈ 392K tokens for gpt-5.4-mini) are split into chunks at newline boundaries
- Each chunk is analysed independently with a per-chunk prompt indicating chunk N of M
- After all chunks are analysed, a merge pass consolidates partial results: sums error counts, de-duplicates anomalies, selects best root cause hypothesis, sorts timeline, and merges next steps
- SSE `event: progress` messages report `{ stage: 'analysing'|'merging', totalChunks, currentChunk }` for multi-chunk jobs
- Single-chunk fast path when log fits within one chunk (most common case)

**Loki Live Tail — WebSocket:**
- Fastify route `ws /api/v1/loki/tail` proxies Loki `/loki/api/v1/tail` WebSocket upstream
- Client connects → Fastify connects to Loki → forwards log stream to client
- Requires `@fastify/websocket`

**Internal Fastify → FastAPI (scrubber):**
- HTTP POST to `http://scrubber:8001/scrub` — Docker Compose internal network only, no auth required, no external port mapping
- Request: `{ text: string, custom_patterns?: string[], min_score?: number }`
  - `custom_patterns`: optional custom regex strings for FR9 (organisation-specific patterns)
  - `min_score`: optional float 0.0–1.0 (default `0.5`) — NER entities below this confidence score are not redacted; satisfies FR12 precision/recall tradeoff
- Response: `{ redacted_text: string, redaction_summary: { entity_type: string, placeholder: string, start: number, end: number }[] }`
  - `entity_type`: uppercased model label (e.g. `PRIVATE_PERSON`, `PRIVATE_EMAIL`)
  - `placeholder`: inserted string (e.g. `[REDACTED_PRIVATE_PERSON]`)
  - `start` / `end`: character offsets of the redacted span in the original `text`
- Fastify uses a configurable timeout for scrubber calls (`SCRUBBER_TIMEOUT_MS`, default 30000)

### Frontend Architecture

**State Management — TanStack Query v5:**
- Server state (data sources, analysis results, user settings) managed by TanStack Query
- Pipeline state machine (idle → fetching → scrubbing → awaiting-review → analysing → complete | error | cancelled) managed as a React `useReducer` hook — not in Query, since it's local UI state
- SSE stream integrated via `EventSource` inside a custom `useAnalysisStream` hook; results fed into local state

**Routing — TanStack Router v1:**
- Routes: `/login`, `/setup` (first-run wizard), `/` (dashboard / data source selector), `/analysis/:id` (analysis view)
- Route guards: unauthenticated users redirected to `/login`; unconfigured system redirected to `/setup`

**Styling — Tailwind CSS v4:**
- No component library for v1; bespoke components for redaction review panel and pipeline progress indicator
- Design tokens defined in `tailwind.config.ts`

**Bundle Optimisation:**
- Vite code splitting: vendor chunk (React, TanStack), app chunk, lazy-loaded analysis view
- No SSR — SPA served as static files by Nginx; no hydration complexity

### Infrastructure & Deployment

**Docker Compose Service Architecture:**
```
Docker Compose services (network: loglens_net)

nginx (port 80/443 → host)
  image: built from nginx/Dockerfile
  - React SPA compiled into image at build time
  - /api/*, /ws/* → http://api:3000
  - /* → /usr/share/nginx/html (SPA dist)
  - TLS termination; HTTP→HTTPS redirect for non-localhost

api (port 3000 → internal only)
  image: built from api/Dockerfile
  - Fastify v5 + Node.js 22 LTS
  - → http://scrubber:8001/scrub
  - → postgres:5432
  - → redis:6379

scrubber (port 8001 → internal only, no host mapping)
  image: built from scrubber/Dockerfile
  - FastAPI 0.115 + Python 3.12
  - NER disabled by default (NER_ENABLED=false); pattern + regex always active
  - When NER enabled: Privacy Filter eager-loaded at startup

postgres (port 5432 → internal only)
  image: postgres:17
  - users, data_sources, system_settings

redis (port 6379 → internal only)
  image: redis:7
  - command: redis-server --save "" --appendonly no
```

**Environment Variables (documented, required at startup):**

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `JWT_SECRET` | Yes | — | Min 32 bytes; validated at startup |
| `SESSION_TTL_SECONDS` | No | `28800` | JWT + Redis TTL (8h) |
| `OIDC_ISSUER_URL` | No | — | If set, enables OIDC mode |
| `OIDC_CLIENT_ID` | No | — | OIDC client ID |
| `OIDC_CLIENT_SECRET` | No | — | OIDC client secret |
| `LLM_PROVIDER` | No | — | `openai` / `anthropic` / `openai-compatible` |
| `LLM_API_KEY` | No | — | Default provider API key |
| `LLM_BASE_URL` | No | — | For OpenAI-compatible / LM Studio |
| `LLM_MODEL` | No | `gpt-5.4-mini` | LLM model name sent in chat completions requests |
| `NER_ENABLED` | No | `false` | Enable NER-based PII detection (requires 4GB+ RAM) |
| `MAX_LOG_SIZE_MB` | No | `10` | Max log payload size |
| `SCRUBBER_TIMEOUT_MS` | No | `30000` | FastAPI scrubber call timeout |
| `HTTPS_ONLY` | No | auto | Forces HTTPS redirect; auto-detected by HOST env |

**Health Checks (FR34):**
- Fastify `GET /health` → checks PostgreSQL connectivity, Redis connectivity, FastAPI scrubber reachability
- Returns `{ status: "ok" | "degraded", checks: { db, redis, scrubber } }`
- Used as Kubernetes liveness + readiness probe target

**CI/CD (deferred detail, placeholder decision):**
- Per-service Dockerfiles with multi-stage builds where needed: `nginx/Dockerfile` (Node build for SPA → Nginx final), `api/Dockerfile` (Node build → Node runtime), `scrubber/Dockerfile` (Python deps → Python runtime)
- GitHub Actions for lint, test (Vitest, pytest, Playwright), `docker compose build` + push

### Decision Impact Analysis

**Implementation Sequence:**
1. PostgreSQL schema + Drizzle migrations
2. Redis setup (docker-compose, no-persistence config)
3. FastAPI scrubber service (Privacy Filter eager load, `/scrub` endpoint)
4. Fastify skeleton (plugins, health check, JWT middleware)
5. OIDC + password auth (openid-client, first-run wizard)
6. Log ingestion routes (direct Loki — Post-MVP, file upload)
7. Scrubbing integration (Fastify → FastAPI → Redis cache)
8. LLM provider abstraction + SSE streaming
9. React SPA (TanStack Router, pipeline state machine, redaction review UI)
10. Docker Compose wiring (nginx/Dockerfile, api/Dockerfile, scrubber/Dockerfile, docker-compose.yml)

**Cross-Component Dependencies:**
- Redis TTL must match `SESSION_TTL_SECONDS`; both derive from the same env var
- FastAPI scrubber must be healthy before Fastify marks itself ready (health check dependency)
- CSRF token middleware must be bypassed for SSE endpoint (GET, not state-mutating)
- Nginx CSP headers must allow `connect-src` for the LM Studio URL when configured

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database Naming Conventions:**
- Tables: `snake_case` plural — `users`, `data_sources`, `system_settings`
- Columns: `snake_case` — `user_id`, `created_at`, `auth_config`
- Indexes: `idx_{table}_{column}` — `idx_data_sources_user_id`
- Foreign keys: `{referenced_table_singular}_id` — `user_id` (not `fk_user_id`)

**API Naming Conventions:**
- Route prefix: `/api/v1/` — all routes versioned from day one
- Resources: `kebab-case` plural nouns — `/api/v1/data-sources`, `/api/v1/analysis-jobs`
- Route params: `:id` style (Fastify convention) — `/api/v1/analysis-jobs/:id`
- Query params: `camelCase` — `?startTime=...&endTime=...`
- JSON response fields: `camelCase` — `{ "userId": 1, "createdAt": "2026-04-27T00:00:00Z" }`
- Dates in JSON: ISO 8601 strings always — never Unix timestamps

**Code Naming Conventions:**
- TypeScript files (utils/services): `camelCase` — `scrubCache.ts`, `lokiClient.ts`
- TypeScript files (React components): `PascalCase` — `RedactionReviewPanel.tsx`, `AnalysisView.tsx`
- Python files: `snake_case` — `privacy_filter.py`, `detect_secrets.py`
- Environment variables: `SCREAMING_SNAKE_CASE` — `MAX_LOG_SIZE_MB`, `JWT_SECRET`
- TypeScript functions: `camelCase` — `getScrubCache`, `submitAnalysis`
- Python functions: `snake_case` — `run_scrub_pipeline`, `load_privacy_filter`

### Structure Patterns

**Project Organisation:**
- Tests co-located with source files: `*.test.ts` next to `*.ts`; `test_*.py` next to `*.py`
- Fastify routes: one file per resource in `api/src/routes/` — `dataSources.ts`, `auth.ts`, `analysis.ts`, `loki.ts`
- Fastify services: pure exported async functions in `api/src/services/` — no class instances
- React: feature-based folders under `src/features/` — `features/analysis/`, `features/auth/`, `features/dataSources/`
- Shared React primitives (Button, Icon, etc.) in `src/components/ui/`

**File Structure Rules:**
- Drizzle schema and migrations: `api/src/db/schema.ts` (single file for v1) + `api/src/db/migrations/`
- Env var schema (Zod): `api/src/config/env.ts` — validated once at startup, exported as `env` singleton
- FastAPI scrubber: flat structure under `scrubber/` — `main.py`, `pipeline/privacy_filter.py`, `pipeline/detect_secrets.py`, `pipeline/regex_rules.py`

### Format Patterns

**API Response Formats:**
- Success: return resource directly — `{ "id": "...", "name": "..." }` (no `data:` wrapper)
- Success collections: return array directly — `[{ ... }, { ... }]`
- Empty collections: `[]` — never `null`
- Errors: RFC 7807 Problem Details always — `{ "type": "...", "title": "...", "status": 400, "detail": "..." }`
- Booleans: `true`/`false` — never `1`/`0`

**Data Exchange Formats:**
- Scrubber internal API: `POST /scrub` request: `{ "text": string, "custom_patterns"?: string[], "min_score"?: number }` / response: `{ "redacted_text": string, "redaction_summary": [{ "entity_type": string, "placeholder": string, "start": number, "end": number }] }`
- LLM analysis output (structured JSON): `{ "errors": [...], "anomalies": [...], "rootCause": { "hypothesis": string, "confidence": string, "evidenceExcerpts": string[] }, "timeline": [...], "recommendations": [...] }`
- Pipeline SSE events: `event: stage\ndata: {"stage": "fetching"|"scrubbing"|"analysing"|"complete"|"error"}\n\n` and `event: token\ndata: {"token": string}\n\n` and `event: progress\ndata: {"stage": "analysing"|"merging", "totalChunks": number, "currentChunk": number}\n\n`

### Communication Patterns

**Pipeline State Machine (React):**
- Explicit named states only: `idle | fetching | scrubbing | awaiting-review | analysing | streaming | complete | error | cancelled`
- No boolean `isLoading` flags — always derive loading state from the state machine value
- State managed via `useReducer` in `features/analysis/useAnalysisPipeline.ts`
- SSE stream managed by custom `useAnalysisStream` hook; tokens appended to local state, not React Query cache

**Async Cancellation (Fastify):**
- Every long-running operation receives an `AbortController` signal
- Signal passed to: Loki HTTP fetch, scrubber HTTP call, LLM SSE stream
- `DELETE /api/v1/analysis-jobs/:id` triggers abort + Redis key delete for in-progress job
- Fastify route handlers must check `request.signal.aborted` before each async step

**Logging (Structured JSON):**
- Node.js: `pino` (Fastify built-in) — JSON to stdout; level set by `LOG_LEVEL` env var
- Python: `structlog` — JSON to stdout; same `LOG_LEVEL` env var respected
- Fastify `onError` hook: scans error message and stack for credential patterns, replaces with `[REDACTED]` before logging or returning to client
- Log fields: always include `requestId`, `userId` (from JWT), `component` (`"api"` / `"scrubber"`)

### Process Patterns

**Error Handling:**
- Fastify route handlers: throw errors — never return error objects; single `setErrorHandler` converts all thrown errors to RFC 7807
- FastAPI: raise `HTTPException` — never return error dicts
- React: TanStack Query `onError` handlers display user-facing messages; raw error details logged to console only in dev mode
- User-facing error messages: generic (`"Analysis failed. Please try again."`) — never expose internal error details or stack traces

**Env Var Validation:**
- Zod schema at `api/src/config/env.ts` validates all env vars at Fastify startup
- If any required var is missing or invalid: log clear error message (`"Missing required env var: JWT_SECRET"`) and `process.exit(1)` before accepting requests
- Same pattern for FastAPI: Pydantic `BaseSettings` in `scrubber/config.py` validates at startup

### Enforcement Guidelines

**All AI Agents MUST:**
- Use `camelCase` for all JSON API fields (never `snake_case` in API responses)
- Use `snake_case` for all database columns and Python identifiers
- Return RFC 7807 error format for all error responses — never a custom error shape
- Never store raw log content anywhere (Redis, PostgreSQL, disk, logs)
- Never log credentials — apply the Fastify `onError` redaction hook to all error paths
- Validate env vars at process startup via Zod (Node.js) or Pydantic Settings (Python) — fail fast
- Name pipeline states explicitly — never use boolean `isLoading` flags for the analysis pipeline
- Pass `AbortController` signals to all async operations in the analysis pipeline

**Anti-Patterns to Avoid:**
- ❌ `{ data: { ... } }` response wrapper — use direct resource responses
- ❌ `{ error: "Something went wrong" }` — use RFC 7807
- ❌ `isLoading: boolean` for pipeline state — use explicit state machine
- ❌ Writing raw log text to any persistent store
- ❌ Catching errors silently — always rethrow or surface to error handler
- ❌ Hardcoded credentials or default secrets

## Project Structure & Boundaries

### Complete Project Directory Structure

```
loglens/
├── README.md
├── .env.example                    # All documented env vars with descriptions
├── .gitignore
├── docker-compose.yml              # Production-mode: app + postgres + redis
├── docker-compose.dev.yml          # Dev: mounts source, hot reload, no nginx
│
├── docker/
│   └── nginx.conf.template         # envsubst-processed at container start
│
├── nginx/
│   └── Dockerfile                  # Multi-stage: node build (SPA) → nginx final
│
├── frontend/                       # React + Vite SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx                # Entry point, router + query client setup
│       ├── router.tsx              # TanStack Router route definitions
│       ├── features/
│       │   ├── auth/
│       │   │   ├── LoginPage.tsx
│       │   │   ├── useAuth.ts
│       │   │   └── authApi.ts
│       │   ├── setup/
│       │   │   ├── FirstRunWizard.tsx
│       │   │   └── setupApi.ts
│       │   ├── dataSources/
│       │   │   ├── DataSourceList.tsx
│       │   │   ├── DataSourceForm.tsx
│       │   │   ├── useDataSources.ts
│       │   │   └── dataSourcesApi.ts
│       │   └── analysis/
│       │       ├── AnalysisView.tsx
│       │       ├── LogSourceSelector.tsx
│       │       ├── RedactionReviewPanel.tsx
│       │       ├── PipelineProgress.tsx
│       │       ├── AnalysisOutput.tsx
│       │       ├── SessionHistory.tsx
│       │       ├── useAnalysisPipeline.ts  # useReducer state machine
│       │       ├── useAnalysisStream.ts    # SSE hook
│       │       └── analysisApi.ts
│       ├── components/
│       │   └── ui/                 # Shared primitives (Button, Badge, etc.)
│       └── lib/
│           ├── apiClient.ts        # fetch wrapper with CSRF token injection
│           └── queryClient.ts      # TanStack Query client config
│
├── api/                            # Fastify Node.js API server
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts                 # Entry: build fastify app + start server
│       ├── app.ts                  # Fastify instance + plugin registration
│       ├── config/
│       │   └── env.ts              # Zod schema; validates + exports env singleton
│       ├── plugins/
│       │   ├── auth.ts             # JWT verify plugin; decorates request.user
│       │   ├── csrf.ts             # @fastify/csrf-protection setup
│       │   ├── cors.ts             # @fastify/cors setup
│       │   └── helmet.ts           # @fastify/helmet + CSP config
│       ├── routes/
│       │   ├── health.ts           # GET /health → db + redis + scrubber checks
│       │   ├── auth.ts             # POST /api/v1/auth/login, /logout, /oidc/*
│       │   ├── setup.ts            # GET/POST /api/v1/setup (first-run wizard)
│       │   ├── dataSources.ts      # CRUD /api/v1/data-sources
│       │   ├── loki.ts             # POST /api/v1/loki/query, /proxy; WS /api/v1/loki/tail
│       │   ├── scrub.ts            # POST /api/v1/scrub (calls FastAPI, caches in Redis)
│       │   └── analysis.ts         # POST /api/v1/analysis-jobs; GET .../stream (SSE); DELETE
│       ├── services/
│       │   ├── scrubCache.ts       # Redis get/set/del for scrub_cache:{userId}:{sessionId}
│       │   ├── lokiClient.ts       # Loki HTTP API v1 queries with AbortController
│       │   ├── llmProvider.ts      # Unified OpenAI-compatible client; streams SSE
│       │   └── oidcClient.ts       # openid-client wrapper; discovery + PKCE flow
│       └── db/
│           ├── schema.ts           # Drizzle table definitions
│           ├── client.ts           # pg pool + drizzle instance
│           └── migrations/         # drizzle-kit generated SQL files
│
├── scrubber/                       # FastAPI Python scrubbing service
│   ├── requirements.txt
│   ├── main.py                     # FastAPI app + lifespan (model eager-load)
│   ├── config.py                   # Pydantic BaseSettings; validates env at startup
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── privacy_filter.py       # transformers.pipeline() NER model wrapper
│   │   ├── detect_secrets.py       # yelp/detect-secrets scanner wrapper
│   │   └── regex_rules.py          # custom regex deny-list patterns
│   └── tests/
│       ├── test_privacy_filter.py  # NER recall tests
│       ├── test_detect_secrets.py  # 100% recall reference set tests
│       └── test_pipeline.py        # End-to-end scrub pipeline tests
│
└── e2e/                            # Playwright end-to-end tests
    ├── playwright.config.ts
    ├── auth.spec.ts                # Login, OIDC flow, first-run wizard
    ├── analysis.spec.ts            # Full pipeline: source select → scrub → LLM → output
    ├── browser-proxy.spec.ts       # Post-MVP: browser-proxied Grafana connection flow (removed from current scope)
    └── fixtures/
        ├── sample.log
        ├── sample.ndjson
        └── reference-secrets.txt   # Reference secret set for recall tests
```

### Architectural Boundaries

**External API Boundary (Nginx → Fastify):**
- `/api/*` and `/ws/*` → Fastify `:3000`
- `/*` → `/app/frontend/dist` (SPA static files)
- Nginx terminates TLS; Fastify never sees raw HTTPS

**Internal Service Boundary (Fastify → FastAPI):**
- `http://scrubber:8001/scrub` — Docker Compose internal network only; no auth required; `scrubber` service has no host port mapping
- Fastify is the only caller; FastAPI has no direct internet access

**Authentication Boundary:**
- All routes except `GET /health`, `POST /api/v1/auth/login`, `GET /api/v1/auth/oidc/*`, `GET/POST /api/v1/setup` require valid JWT
- JWT validated in `plugins/auth.ts`; `request.user` decorated onto all authenticated requests

**Data Boundary:**
- PostgreSQL: named entities only (users, data_sources, system_settings) — never log content
- Redis: scrub cache only (`scrub_cache:{userId}:{sessionId}`) — never raw logs; no persistence
- In-flight log content: lives only in Node.js process memory during the request lifecycle

### Requirements to Structure Mapping

| FR Category | Primary Location |
|---|---|
| Log Source & Ingestion (FR1–6) | `api/src/routes/loki.ts`, `api/src/services/lokiClient.ts`, `frontend/src/features/dataSources/`, `frontend/src/features/analysis/LogSourceSelector.tsx` |
| Privacy Scrubbing Pipeline (FR7–14) | `scrubber/pipeline/`, `api/src/routes/scrub.ts`, `api/src/services/scrubCache.ts`, `frontend/src/features/analysis/RedactionReviewPanel.tsx` |
| LLM Provider Configuration (FR15–18) | `api/src/services/llmProvider.ts`, `api/src/routes/analysis.ts`, `frontend/src/features/analysis/useAnalysisStream.ts` |
| Log Analysis & Output (FR19–25) | `api/src/routes/analysis.ts` (LLM prompt + structured output enforcement), `frontend/src/features/analysis/AnalysisOutput.tsx` |
| Authentication & Access (FR26–30) | `api/src/routes/auth.ts`, `api/src/services/oidcClient.ts`, `api/src/plugins/auth.ts`, `api/src/db/schema.ts`, `frontend/src/features/auth/` |
| Deployment & Configuration (FR31–34) | `api/src/config/env.ts`, `scrubber/config.py`, `docker/`, `docker-compose.yml`, `api/src/routes/health.ts` |
| Analysis UX & Workflow (FR35–38) | `frontend/src/features/analysis/useAnalysisPipeline.ts`, `frontend/src/features/analysis/PipelineProgress.tsx`, `frontend/src/features/analysis/SessionHistory.tsx` |

### Integration Points

**Internal Communication:**
- Frontend → Fastify: REST JSON (`/api/v1/*`) + SSE (`GET /api/v1/analysis-jobs/:id/stream`) + WebSocket (`ws /api/v1/loki/tail`)
- Fastify → FastAPI: HTTP POST to `http://127.0.0.1:8001/scrub` (per-request, with configurable timeout)
- Fastify → Redis: `ioredis` client; get/set/del on `scrub_cache:*` keys
- Fastify → PostgreSQL: `pg` + Drizzle ORM

**External Integrations:**
- Fastify → Loki: HTTP API v1 (`/loki/api/v1/query_range`, `/loki/api/v1/tail`) — Post-MVP
- Fastify → LLM API: OpenAI-compatible streaming endpoint; provider URL from env
- Fastify → OIDC Provider: `openid-client` discovery + authorization code flow with PKCE — Post-MVP

**Data Flow (happy path):**
```
User uploads log file (or selects Loki source — Post-MVP)
  → Fastify receives file upload (or fetches logs from Loki — Post-MVP)
  → Fastify POST to FastAPI /scrub → redacted_text + redaction_summary
  → Fastify stores scrubbed content in Redis (scrub_cache key, TTL = session TTL)
  → Frontend shows RedactionReviewPanel; user confirms
  → Fastify streams scrubbed content to LLM API
  → SSE tokens forwarded to frontend in real-time
  → Final structured JSON stored in Redis (analysis result, same TTL)
  → Frontend renders AnalysisOutput with citations
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices are compatible. Node.js 22 LTS satisfies Fastify v5's Node ≥ 20 requirement. Python 3.12 + FastAPI 0.115 uses Pydantic v2 by default — no migration needed. React 19 + TanStack Query v5 + TanStack Router v1 are all GA and mutually compatible; pin `@tanstack/react-router@^1.120.0` to ensure explicit React 19 peer dep support is included. Drizzle ORM uses the `pg` driver natively. `ioredis` is the standard Redis 7 client for Node.js. `openid-client` v6 integrates directly with Fastify v5 without Passport.

**Pattern Consistency:**
`camelCase` JSON fields map to `snake_case` database columns automatically via Drizzle column aliases — no manual conversion in route handlers. RFC 7807 error format is provided out-of-the-box by `@fastify/sensible` and requires no custom error shape. SSE and WebSocket are both natively supported in Fastify v5 without additional adapters.

**Structure Alignment:**
Project structure maps directly to FR categories (verified in requirements mapping table). Internal service boundaries (Fastify → FastAPI loopback, Redis no-persistence, PostgreSQL no-log-data) all enforce the PRD security constraints architecturally rather than by convention.

### Requirements Coverage Validation ✅

**Functional Requirements (38/38 covered):**
All FR categories have explicit structural homes and integration points documented. Session cache invalidation on logout/expiry (FR30) is enforced by matching Redis TTL to `SESSION_TTL_SECONDS`.

**Non-Functional Requirements:**
- Performance: FastAPI lifespan eager-loads Privacy Filter at startup (no cold start); Redis cache enables < 5s re-runs; SSE streaming delivers first tokens within LLM latency bounds
- Security: `@fastify/helmet` (CSP), `@fastify/csrf-protection`, `onError` credential redaction hook, Redis `--save "" --appendonly no`, read-only container FS all addressed
- Scalability: Redis externalises session state, enabling horizontal scaling in Phase 2 without architecture changes
- Accessibility: WCAG 2.1 AA compliance requires `@axe-core/playwright` added to E2E tests for automated violation detection

### Implementation Readiness Validation ✅

**LLM Provider Interface Contract:**
```typescript
// api/src/services/llmProvider.ts
interface LLMProvider {
  stream(prompt: string, signal: AbortSignal): AsyncIterable<string>  // yields tokens
}
// Factory resolves provider from env; all implement OpenAI chat completions streaming
// Anthropic uses the openai-compatible adapter endpoint — no separate client needed
```

**LLM Structured Output Enforcement:**
The LLM system prompt must instruct JSON output. Fastify validates the final SSE `complete` event payload against a Zod schema matching the analysis output structure before forwarding to the frontend. Malformed LLM output returns a structured RFC 7807 error — never forwarded raw.

### Gap Analysis Results

| Priority | Gap | Resolution |
|---|---|---|
| Important | React 19 + TanStack Router peer dep | Pin `@tanstack/react-router@^1.120.0` in `frontend/package.json` |
| Important | `llmProvider.ts` interface undocumented | Interface contract documented above |
| Important | LLM output schema enforcement | Zod validation on `complete` SSE event in `api/src/routes/analysis.ts` |
| Minor | WCAG automated testing | Add `@axe-core/playwright` to `e2e/` setup |
| Minor | Dev hot-reload strategy | Vite dev server :5173, Fastify `tsx watch`, FastAPI `uvicorn --reload` in `docker-compose.dev.yml` |

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context and cross-cutting concerns identified
- [x] Scale and complexity assessed (medium-high, 5 components)
- [x] Technical constraints mapped (Python required for Privacy Filter, single container, no log persistence)

**✅ Architectural Decisions**
- [x] Full technology stack specified with versions
- [x] Multi-process container strategy (supervisord + tini) decided
- [x] Auth strategy (OIDC + password fallback, httpOnly JWT) decided
- [x] Session cache strategy (Redis, no persistence, TTL-matched) decided
- [x] Streaming protocols (SSE for LLM, WebSocket for Loki tail) decided
- [x] All 5 remaining decisions resolved in step 4

**✅ Implementation Patterns**
- [x] Naming conventions (DB, API, code, env vars) defined
- [x] Project organisation (feature-based frontend, service-per-resource API) defined
- [x] Error handling (RFC 7807, single error handler, throw-don't-return) defined
- [x] Pipeline state machine (explicit named states, no boolean flags) defined
- [x] Cancellation pattern (AbortController through all async operations) defined
- [x] Anti-patterns explicitly listed

**✅ Project Structure**
- [x] Complete directory tree with all files named
- [x] FR category to directory mapping table complete
- [x] All integration points (internal + external) documented
- [x] Full data flow documented

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Key Strengths:**
- Privacy-by-architecture enforced structurally — scrubbed log cache in Redis with no persistence, raw logs never touch any store
- Single `LLMProvider` interface abstracts all providers; AI agents implementing stories never need to know which provider is configured
- Explicit pipeline state machine prevents inconsistent loading-state implementations across agents
- All env vars validated at startup with Zod/Pydantic — fail-fast before accepting requests

**First Implementation Story:**
1. PostgreSQL schema + Drizzle migrations (`api/src/db/`)
2. Redis setup in `docker-compose.yml` with no-persistence flags
3. FastAPI scrubber skeleton with Privacy Filter eager-load + `/scrub` endpoint
4. Fastify skeleton with env validation, health check, JWT auth plugin
