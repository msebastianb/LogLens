---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
---

# nf-project (LogLens) - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for LogLens, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Users can connect to a Grafana/Loki instance by providing a server URL and authentication credentials
FR2: Users can query logs from a connected Loki instance with a time range and  LogQL filter
FR4: Users can upload log files for analysis (.log, .json, .ndjson formats)
FR5: Users can select between direct server connection and file upload as the log source
FR6: Users can configure multiple named Grafana/Loki data source connections
FR7: The system automatically scrubs PII and secrets from log content before any LLM submission
FR8: Users can review a summary of what was redacted before confirming submission to the LLM
FR9: Users can configure custom regex patterns for organisation-specific sensitive data detection
FR10: The system detects and redacts secrets using pattern-based detection (API keys, tokens, credentials)
FR11: The system detects and redacts PII using NER-based detection (names, emails, addresses, phone numbers, account numbers, dates, URLs)
FR12: Users can adjust the scrubbing precision/recall tradeoff before submission
FR13: The system caches the scrubbed (not raw) log content for the duration of the authenticated session
FR14: Users can re-run analysis on cached scrubbed logs without re-fetching or re-scrubbing
FR15: Users can configure a remote LLM provider (OpenAI, Anthropic, any OpenAI-compatible endpoint) via environment variables
FR16: Users can override the configured LLM provider with their own API key via the UI
FR17: Users can configure a local LLM provider (LM Studio or compatible) with no external network calls during analysis
FR18: The system streams LLM analysis output to the UI as it is generated
FR19: The system identifies and surfaces errors from log content with frequency and distribution
FR20: The system identifies anomalous patterns in log content
FR21: The system generates a root cause hypothesis with a confidence indication
FR22: The system reconstructs a timeline of affected components and events
FR23: The system provides recommended next steps based on the analysis
FR24: All analysis output cites actual log excerpts as evidence
FR25: Analysis output is clearly labelled as LLM-generated and not authoritative
FR26: Users can authenticate via a configured OIDC/OAuth2 identity provider (Logto or compatible)
FR27: An admin can complete a first-run setup wizard to configure an admin password when no OIDC provider is set
FR28: Users can log in with username and password when no OIDC provider is configured
FR29: The system maintains authenticated user sessions
FR30: Session expiry invalidates the scrubbed log cache
FR31: Administrators can configure all application behaviour via documented environment variables
FR32: The application runs from a Docker Compose configuration without modification across deployment contexts
FR33: The application enforces HTTPS for all non-localhost deployments
FR34: The application performs a health check on startup and reports readiness
FR35: Users can see progress state for each pipeline stage (fetching, scrubbing, analysing, complete)
FR36: Users can cancel an in-progress analysis
FR37: The UI remains interactive while analysis is running
FR38: Users can view analysis history within their current session

### NonFunctional Requirements

NFR1: Initial page load (authenticated session) < 3 seconds on a standard corporate connection
NFR2: Log fetch + scrubbing pipeline: progress indicator visible within 1 second of submission
NFR3: Analysis completion (10,000-line log file) < 60 seconds end-to-end
NFR4: Session cache re-run (resend scrubbed content to LLM) < 5 seconds
NFR5: UI main thread must not block during any long-running operation — fetch, scrub, and LLM calls execute asynchronously
NFR6: LLM responses streamed to UI; first tokens must appear within 5 seconds of LLM call initiation
NFR7: When NER is enabled (`NER_ENABLED=true`), OpenAI Privacy Filter model loaded eagerly at container startup — no cold-start latency on first request; NER disabled by default for CPU-only deployments
NFR8: All credentials must never appear in server logs, error responses, API responses, or UI output
NFR9: Scrubbing pipeline runs before any log content is written to session cache — cached data is always scrubbed, never raw
NFR10: Session-scoped cache: no cross-user data access; cache invalidated on session logout or expiry
NFR11: HTTPS enforced for all non-localhost deployments; HTTP acceptable only on localhost
NFR12: CSRF protection required on all state-mutating API endpoints for non-localhost deployments
NFR13: Content Security Policy headers restrict script execution sources and prevent XSS
NFR14: Container supports read-only filesystem mounts except for explicitly defined ephemeral cache and log volumes
NFR15: No log data persisted to disk permanently; all log content is transient in session memory only
NFR16: Single shared deployment must support concurrent sessions for all engineers without degradation
NFR17: Minimum 4GB RAM container; 8GB recommended for shared deployments
NFR18: Configurable maximum log size per request to prevent memory exhaustion; default 10MB (MAX_LOG_SIZE_MB)
NFR19: All external calls respect configurable timeouts; no unbounded blocking operations
NFR20: WCAG 2.1 AA compliance for all primary user workflows
NFR21: Full keyboard navigation throughout the application
NFR22: Screen reader compatibility for core workflows (log source selection, redaction review, analysis output)
NFR23: Sufficient colour contrast on redaction highlights, status indicators, and analysis output
NFR24: Grafana/Loki: compatible with Loki HTTP API v1; graceful degradation when patterns API unavailable
NFR25: LLM providers: OpenAI API-compatible interface; supports streaming responses (SSE or WebSocket)
NFR26: Identity providers: standard OIDC/OAuth2 — tested with Logto; any spec-compliant provider must work
NFR27: Container orchestration: Docker Compose (local) and Kubernetes (shared); liveness and readiness probes
NFR28: Log file formats: .log (plaintext), .json (structured), .ndjson (newline-delimited JSON); malformed files fail gracefully

### Additional Requirements

- **No single scaffold**: Polyglot stack (Node.js + Python + React) requires each layer initialised independently; no single `create-*` command bootstraps the project
- **Docker Compose multi-service deployment**: Five services — `nginx`, `api` (Fastify), `scrubber` (FastAPI), `postgres`, `redis`; each with its own `Dockerfile`; all on a shared internal network `loglens_net`
- **FastAPI scrubber isolation**: `scrubber` service has no host port mapping — reachable only via `http://scrubber:8001` from the `api` service on the internal Docker network
- **Redis no-persistence**: Must start with `--save "" --appendonly no`; Redis TTL must match SESSION_TTL_SECONDS env var
- **Zod env validation**: All required env vars validated at Fastify startup via Zod schema in `api/src/config/env.ts`; process.exit(1) on failure
- **Pydantic env validation**: All required env vars validated at FastAPI startup via Pydantic BaseSettings in `scrubber/config.py`
- **LLM provider interface**: Single `LLMProvider` interface (`stream(prompt, signal): AsyncIterable<string>`) in `api/src/services/llmProvider.ts`; factory resolves from env; all providers use OpenAI chat completions streaming API
- **LLM structured output enforcement**: Zod schema validates final SSE `complete` event payload in `api/src/routes/analysis.ts` before forwarding to frontend; malformed output returns RFC 7807 error
- **Pipeline state machine**: Explicit React `useReducer` states: `idle | fetching | scrubbing | awaiting-review | analysing | streaming | complete | error | cancelled` — never boolean `isLoading`
- **AbortController cancellation**: All long-running operations (Loki fetch, scrubber HTTP call, LLM stream) receive an AbortSignal; `DELETE /api/v1/analysis-jobs/:id` triggers abort + Redis key delete
- **OIDC with PKCE**: `openid-client` handles discovery + authorization code flow with PKCE; Fastify issues httpOnly JWT after successful callback; no Passport layer
- **RFC 7807 errors**: All error responses use Problem Details format via `@fastify/sensible`; no custom error shapes
- **First-run wizard state**: Stored in PostgreSQL `system_settings` table (key/value); not in env vars or file system
- **Health check**: `GET /health` checks PostgreSQL, Redis, and FastAPI scrubber reachability; used as Kubernetes liveness + readiness probe
- **Per-service Dockerfiles**: `nginx/Dockerfile` (multi-stage: Node build for SPA → Nginx final), `api/Dockerfile` (Node build → Node runtime), `scrubber/Dockerfile` (Python deps → Python runtime)
- **@axe-core/playwright**: Added to E2E test setup for automated WCAG 2.1 AA violation detection in CI

### UX Design Requirements

No UX design document exists for this project. UX requirements are captured in PRD Web Application Specific Requirements and Architecture patterns (pipeline state machine, redaction review UI, SSE streaming).

### FR Coverage Map

FR1: Epic 2 — Connect to Grafana/Loki by URL + credentials *(Post-MVP)*
FR2: Epic 2 — Query logs with time range and LogQL filter *(Post-MVP)*
FR4: Epic 2 — Upload .log / .json / .ndjson files
FR5: Epic 2 — Select log source type (direct / file)
FR6: Epic 2 — Manage multiple named data source connections *(Post-MVP)*
FR7: Epic 3 — Automatic PII + secrets scrubbing before LLM submission
FR8: Epic 3 — Redaction review UI before submission
FR9: Epic 3 — Custom regex patterns for org-specific sensitive data
FR10: Epic 3 — Secrets detection (API keys, tokens, credentials)
FR11: Epic 3 — NER-based PII detection (names, emails, addresses, etc.)
FR12: Epic 3 — Adjustable scrubbing precision/recall tradeoff
FR13: Epic 3 — Session-scoped cache of scrubbed (not raw) logs
FR14: Epic 3 — Re-run analysis on cached scrubbed logs
FR15: Epic 4 — Configure remote LLM provider via env vars
FR16: Epic 4 — Override LLM provider API key from UI *(Post-MVP)*
FR17: Epic 4 — Configure local LLM provider (LM Studio / compatible)
FR18: Epic 4 — Stream LLM analysis tokens to UI as generated
FR19: Epic 4 — Surface errors with frequency and distribution
FR20: Epic 4 — Identify anomalous patterns
FR21: Epic 4 — Root cause hypothesis with confidence indication
FR22: Epic 4 — Timeline of affected components and events
FR23: Epic 4 — Recommended next steps
FR24: Epic 4 — Analysis output cites actual log excerpts as evidence
FR25: Epic 4 — Analysis output labelled as LLM-generated / non-authoritative
FR26: Epic 1 — Authenticate via OIDC/OAuth2 identity provider *(Post-MVP)*
FR27: Epic 1 — First-run setup wizard for admin password (no OIDC)
FR28: Epic 1 — Username/password login fallback (no OIDC)
FR29: Epic 1 — Maintain authenticated user sessions (httpOnly JWT)
FR30: Epic 1 — Session expiry invalidates scrubbed log cache
FR31: Epic 1 — All behaviour configurable via env vars
FR32: Epic 1 — Single container image across deployment contexts
FR33: Epic 1 — HTTPS enforced for non-localhost deployments
FR34: Epic 1 — Startup health check reports readiness
FR35: Epic 5 — Progress state per pipeline stage (fetching / scrubbing / analysing / complete)
FR36: Epic 5 — Cancel in-progress analysis
FR37: Epic 5 — UI remains interactive during long-running operations
FR38: Epic 5 — View analysis history within current session *(Post-MVP)*

## Epic List

### Epic 1: Platform Foundation — Deployment, Configuration & Authentication
Users can deploy LogLens as a single container, complete first-run setup, and log in via OIDC or username/password. Admins control all behaviour through environment variables. The application enforces HTTPS, performs a startup health check, and maintains secure sessions.
**FRs covered:** FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34

### Epic 2: Log Ingestion & Source Management
Users can upload local log files for analysis. Direct Loki connection and named data source management are deferred to Post-MVP.
**FRs covered (MVP):** FR4, FR5
**FRs covered (Post-MVP):** FR1, FR2, FR6

### Epic 3: Privacy Scrubbing & Redaction Review
Users are protected by automatic PII and secrets scrubbing before any log content reaches an LLM. They can review a summary of what was redacted, configure custom patterns, tune the precision/recall tradeoff, and re-run analysis on cached scrubbed logs without re-fetching.
**FRs covered:** FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14

### Epic 4: AI-Powered Log Analysis
Users submit scrubbed logs to a configured LLM (remote or local) and receive streamed analysis: identified errors with frequency, anomaly patterns, root cause hypothesis, component timeline, and actionable next steps — all citing actual log excerpts and clearly labelled as AI-generated.
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25

### Epic 5: Pipeline UX & Session Experience
Users experience a responsive, real-time pipeline: per-stage progress indicators, in-flight cancellation, a non-blocking UI throughout all long-running operations, and access to analysis history for the current session.
**FRs covered:** FR35, FR36, FR37, FR38

### Epic 6: Frontend Application UI
All user-facing screens are implemented from functional skeletons to a complete, navigable application. Covers: persistent authenticated shell with navigation, polished auth screens (login + setup wizard), dashboard home screen, analysis workflow UI (upload, scrubbing progress, redaction review), and analysis streaming display with structured results. Developer is free to implement visual styles; stories define user flows and required screen elements only.
**NFRs addressed:** NFR20 (WCAG 2.1 AA), NFR21 (keyboard navigation), NFR22 (screen reader compatibility), NFR23 (colour contrast)

---

## Epic 1: Platform Foundation — Deployment, Configuration & Authentication

Users can deploy LogLens with `docker compose up`, complete first-run setup, and log in via OIDC or username/password. Admins control all behaviour through environment variables. HTTPS enforced, health check on startup, sessions maintained securely.

### Story 1.1: Docker Compose stack with per-service env validation

As a system administrator,
I want to start the full LogLens stack with `docker compose up` and have each service validate its own configuration at startup,
So that misconfigured deployments fail immediately with a clear error rather than silently misbehaving at runtime.

**Acceptance Criteria:**

**Given** all required env vars are present and a `docker-compose.yml` exists,
**When** `docker compose up` is run,
**Then** all five services (`nginx`, `api`, `scrubber`, `postgres`, `redis`) start and reach healthy state.

**Given** the `api` service is starting,
**When** a required Fastify env var is absent or invalid,
**Then** Zod env validation logs the missing variable name and the Node.js process exits with code 1.

**Given** the `scrubber` service is starting,
**When** a required env var is absent,
**Then** Pydantic BaseSettings logs the validation error and the Python process exits non-zero.

**Given** the `scrubber` service is running,
**When** its Docker Compose service definition is inspected,
**Then** no `ports:` mapping exists — the service is reachable only via `http://scrubber:8001` on the internal `loglens_net` network.

**Given** a non-localhost deployment,
**When** an HTTP request reaches `nginx`,
**Then** Nginx returns a 301 redirect to the HTTPS equivalent URL.

**Given** a `docker-compose.dev.yml` override,
**When** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` is run,
**Then** source directories are volume-mounted for hot reload (Vite HMR, Fastify `tsx watch`, Uvicorn `--reload`) without rebuilding images.

**Test Scenarios:**

*Unit (Vitest):*
- Zod env schema: valid env object passes; missing `DATABASE_URL` throws with field name in message; missing `JWT_SECRET` throws
- Zod env schema: `JWT_SECRET` shorter than 32 bytes throws

*Unit (pytest):*
- Pydantic BaseSettings: missing required field raises `ValidationError` with field name

*Integration (Vitest + testcontainers or Docker Compose test profile):*
- All five services reach healthy state after `docker compose up`
- `GET http://localhost/health` returns 200 when all deps up
- `scrubber` container is not reachable on any host port (TCP connection refused to any published port)
- HTTP request to `http://localhost:80` returns 301 redirect to `https://` equivalent when `HTTPS_ONLY=true`

---

### Story 1.2: Database schema migration and health check

As a system administrator,
I want the database schema to be applied automatically on first start and the health endpoint to confirm all dependencies are reachable,
So that I don't run manual migration steps and Kubernetes knows when the pod is ready.

**Acceptance Criteria:**

**Given** `DATABASE_URL` is set and the `postgres` service is reachable,
**When** the `api` container starts,
**Then** Drizzle runs pending migrations and creates `users`, `system_settings`, and `data_sources` tables if absent.

**Given** a migration failure,
**When** the container starts,
**Then** Fastify logs the error and `GET /health` returns 503.

**Given** all dependencies (`postgres`, `redis`, `scrubber`) are reachable,
**When** `GET /health` is called,
**Then** the response is 200 JSON `{ "status": "ok", "checks": { "db": "ok", "cache": "ok", "scrubber": "ok" } }`.

**Given** any one dependency is unreachable,
**When** `GET /health` is called,
**Then** the response is 503 JSON with the failing dependency identified by name.

**Test Scenarios:**

*Unit (Vitest):*
- `runMigrations()`: called once on startup; idempotent on re-run (no error if tables exist)
- Health route handler: returns `{ status: "ok" }` when all dependency checks resolve; returns `{ status: "degraded" }` with failed dep name when one rejects
- Health route handler: responds with 200 when ok, 503 when degraded

*Integration (Vitest + real DB):*
- `GET /health` returns 200 with all checks `"ok"` when PostgreSQL, Redis, and scrubber are reachable
- `GET /health` returns 503 with `"db": "error"` when PostgreSQL is stopped
- `GET /health` returns 503 with `"scrubber": "error"` when scrubber container is stopped
- Drizzle migrations create `users`, `system_settings`, and `data_sources` tables on a fresh database
- Re-running migrations against an already-migrated database produces no error

---

### Story 1.3: First-run setup wizard

As an administrator,
I want to complete a first-run setup wizard to create an admin account when no OIDC provider is configured,
So that the application is secured on first launch without requiring pre-existing identity infrastructure.

**Acceptance Criteria:**

**Given** `OIDC_ISSUER_URL` is not set and `system_settings` row `first_run_complete = false`,
**When** a user navigates to any page,
**Then** the UI redirects to `/setup`.

**Given** the setup form,
**When** the admin submits a password of at least 12 characters,
**Then** the password is bcrypt-hashed, the admin user is created in `users`, and `system_settings.first_run_complete` is set to `true`.

**Given** the wizard is already complete,
**When** a user navigates to `/setup`,
**Then** they are redirected to `/login`.

**Given** a password shorter than 12 characters is submitted,
**When** the form is validated,
**Then** a validation error is shown and no user is created.

**Test Scenarios:**

*Unit (Vitest):*
- `isFirstRunComplete()`: returns `false` when `system_settings` has no `first_run_complete` row; returns `true` when row is `true`
- `createAdminUser()`: bcrypt hashes password (output !== input; length ≥ 60 chars)
- Setup route: password < 12 chars returns 400 with validation error; does not call `createAdminUser`
- Setup route: redirects to `/login` when `first_run_complete = true`

*Integration (Vitest + real DB):*
- `POST /api/v1/setup` with valid password creates a user row and sets `first_run_complete = true` in `system_settings`
- `POST /api/v1/setup` with password < 12 chars returns 400; no user row created
- Second call to `POST /api/v1/setup` returns 409 (wizard already complete)

*E2E (Playwright — `e2e/auth.spec.ts`):*
- Fresh deployment: navigating to `/` redirects to `/setup`
- Submitting valid password redirects to `/login`
- After setup, navigating to `/setup` redirects to `/login`

---

### Story 1.4: Username/password login and logout

As a user,
I want to log in with my username and password,
So that I can access LogLens when no OIDC provider is configured.

**Acceptance Criteria:**

**Given** valid credentials,
**When** I submit the login form,
**Then** a httpOnly signed JWT is set as a cookie and I am redirected to the dashboard.

**Given** invalid credentials,
**When** I submit the login form,
**Then** a generic "Invalid credentials" error is shown — no indication of whether username or password was wrong.

**Given** an expired or tampered JWT,
**When** I access a protected route,
**Then** I am redirected to `/login`.

**Given** I click "Log out",
**When** the request is processed,
**Then** the JWT cookie is cleared, the server-side session is invalidated, and any Redis scrub-cache keys for my session are deleted.

**Given** OIDC is configured,
**When** I navigate to `/login`,
**Then** the username/password form is hidden and only the SSO button is shown.

**Test Scenarios:**

*Unit (Vitest):*
- `verifyPassword()`: returns `true` for correct bcrypt match; returns `false` for wrong password; timing is constant (uses `bcrypt.compare`)
- Auth plugin: valid JWT in cookie decorates `request.user`; missing cookie returns 401; tampered JWT returns 401
- Login route: invalid credentials return 401 with generic message (no username/password distinction)
- Logout route: clears JWT cookie; calls `scrubCache.deleteAll(userId)`

*Integration (Vitest + real DB + Redis):*
- `POST /api/v1/auth/login` with correct credentials: response sets httpOnly cookie; redirects to `/`
- `POST /api/v1/auth/login` with wrong password: returns 401 with `"Invalid credentials"` (no detail)
- `POST /api/v1/auth/logout`: JWT cookie cleared; Redis keys for the user deleted
- Accessing `/api/v1/data-sources` with expired JWT returns 401

*E2E (Playwright — `e2e/auth.spec.ts`):*
- Login with valid credentials lands on dashboard
- Login with invalid credentials shows generic error
- Logout clears session and redirects to `/login`
- When `OIDC_ISSUER_URL` is set, `/login` shows SSO button only

---

### Story 1.5: OIDC/OAuth2 authentication *(Post-MVP)*

As a user,
I want to authenticate via the organisation's identity provider using SSO,
So that I can use my existing corporate credentials without a separate LogLens password.

**Acceptance Criteria:**

**Given** `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are set,
**When** I click "Login with SSO",
**Then** I am redirected to the OIDC provider's authorisation endpoint using the PKCE flow (via `openid-client` v6).

**Given** a successful OIDC callback,
**When** the authorisation code is exchanged,
**Then** a httpOnly signed JWT is issued by Fastify and I am redirected to the dashboard.

**Given** the OIDC provider returns an error in the callback,
**When** the callback is processed,
**Then** I am redirected to `/login` with a clear error message displayed.

**Given** I log out,
**When** the request is processed,
**Then** the local JWT cookie is cleared and, if the OIDC provider exposes an end-session endpoint, I am redirected to it.

**Test Scenarios:**

*Unit (Vitest):*
- `oidcClient.buildAuthorizationUrl()`: returns URL with `code_challenge` and `code_challenge_method=S256` params (PKCE)
- OIDC callback handler: issues JWT and sets httpOnly cookie on successful token exchange
- OIDC callback handler: redirects to `/login?error=...` when provider returns `error` param

*Integration (Vitest + mock OIDC server):*
- `GET /api/v1/auth/oidc/login` redirects to mock provider with correct PKCE params
- `GET /api/v1/auth/oidc/callback` with valid code exchanges token and issues JWT cookie
- `GET /api/v1/auth/oidc/callback` with `error=access_denied` redirects to `/login`

*E2E (Playwright — `e2e/auth.spec.ts`):*
- SSO login flow with mock OIDC provider completes and lands on dashboard
- OIDC logout redirects to provider end-session endpoint when available

---

### Story 1.6: HTTP security headers and CSRF protection

As a security-conscious administrator,
I want LogLens to emit security headers and enforce CSRF protection on all state-mutating endpoints,
So that the application is hardened against XSS, clickjacking, and CSRF without additional configuration.

**Acceptance Criteria:**

**Given** any Fastify API response,
**When** the response headers are inspected,
**Then** `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security` are present.

**Given** a POST, PUT, or DELETE API request,
**When** it is made without a valid CSRF token (for non-localhost deployments),
**Then** Fastify returns 403.

**Given** the application is running and processing requests,
**When** Fastify logs are inspected,
**Then** no JWT values, passwords, API keys, or session tokens appear in log output.

**Test Scenarios:**

*Unit (Vitest):*
- Helmet plugin config: CSP, `X-Frame-Options`, `X-Content-Type-Options`, and HSTS header values match expected configuration
- CSRF plugin: `POST /api/v1/auth/login` is exempt; `POST /api/v1/data-sources` requires valid token
- Log redaction: Fastify logger serializer strips `authorization`, `cookie`, and `x-api-key` fields

*Integration (Vitest + Fastify test instance):*
- `GET /health` response includes `Content-Security-Policy` header
- `POST /api/v1/data-sources` without CSRF token returns 403 on non-localhost
- `POST /api/v1/data-sources` with valid CSRF token returns 201
- Fastify access log for a request containing a JWT does not include the token value

---

## Epic 2: Log Ingestion & Source Management

Users can upload local log files for analysis. Direct Loki connection and named data source management are deferred to Post-MVP.

### Story 2.1: Named data source CRUD *(Post-MVP)*

As a user,
I want to create, view, edit, and delete named Grafana/Loki data source connections,
So that I can manage multiple log environments without re-entering connection details each time.

**Acceptance Criteria:**

**Given** I am authenticated and on the dashboard,
**When** I open the data sources panel,
**Then** I see a list of my saved data sources (name, URL) or an empty state if none exist.

**Given** I fill in a name, base URL, and optional credentials,
**When** I save the data source,
**Then** it appears in the list and is persisted in the `data_sources` PostgreSQL table linked to my user.

**Given** I edit a saved data source,
**When** I submit the form,
**Then** the record is updated and the list reflects the change.

**Given** I delete a data source,
**When** I confirm the deletion,
**Then** it is removed from the list and from PostgreSQL; any in-progress analysis using it is unaffected.

**Given** I attempt to save a data source with a missing name or URL,
**When** the form is submitted,
**Then** validation errors are shown inline and no record is created.

**Given** I am unauthenticated,
**When** I call `GET /api/v1/data-sources`,
**Then** Fastify returns 401.

**Test Scenarios:**

*Unit (Vitest):*
- Data source schema validation: missing `name` field returns validation error; missing `url` field returns validation error
- Data source route: unauthenticated request returns 401 (auth plugin applied)
- `DELETE /api/v1/data-sources/:id`: returns 404 when ID does not belong to authenticated user (no cross-user leakage)

*Integration (Vitest + real DB):*
- `POST /api/v1/data-sources`: creates record in `data_sources` table linked to authenticated user
- `GET /api/v1/data-sources`: returns only data sources owned by the authenticated user
- `PUT /api/v1/data-sources/:id`: updates record; `GET` reflects change
- `DELETE /api/v1/data-sources/:id`: removes record; subsequent `GET` returns empty list
- `POST /api/v1/data-sources` with missing name: returns 400 with field error; no DB row created

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Create, edit, and delete a data source via the UI; list reflects changes after each operation
- Empty state message shown when no data sources exist

---

### Story 2.2: Direct Loki log fetch with LogQL and time range *(Post-MVP)*

As a user,
I want to select a named data source, enter a LogQL query with a time range, and fetch matching logs,
So that I can pull specific log data from Loki for analysis.

**Acceptance Criteria:**

**Given** I select a named data source and the source type is "Direct",
**When** I enter a valid LogQL expression and a time range (start + end),
**Then** Fastify calls the Loki HTTP API v1 (`/loki/api/v1/query_range`) using the stored credentials and returns the matching log lines to the UI.

**Given** the Loki request exceeds `MAX_LOG_SIZE_MB` (default 10 MB),
**When** Fastify receives the response,
**Then** it rejects the payload with an RFC 7807 error `413 Payload Too Large` before the scrubbing pipeline is entered.

**Given** the Loki server is unreachable or returns an error,
**When** the fetch is attempted,
**Then** Fastify returns an RFC 7807 error with the upstream status; no log content is cached or forwarded.

**Given** the fetch is in progress and I cancel it,
**When** cancellation is triggered,
**Then** the Loki HTTP request is aborted via AbortController and the UI returns to idle state.

**Given** the Loki API `/loki/api/v1/labels` (patterns) endpoint is unavailable,
**When** the fetch completes,
**Then** log lines are still returned; the missing labels endpoint is silently ignored.

**Test Scenarios:**

*Unit (Vitest):*
- `lokiClient.queryRange()`: builds correct Loki API URL with query, start, and end params
- `lokiClient.queryRange()`: throws `PayloadTooLargeError` when response body exceeds `MAX_LOG_SIZE_MB`
- `lokiClient.queryRange()`: calls `signal.abort()` propagation; aborted request throws `AbortError`
- Log size check: exactly `MAX_LOG_SIZE_MB` passes; one byte over throws

*Integration (Vitest + mock Loki server):*
- `POST /api/v1/loki/query` returns log lines from mock Loki server
- `POST /api/v1/loki/query` with oversized mock response returns RFC 7807 413
- `POST /api/v1/loki/query` when Loki returns 401: Fastify returns RFC 7807 502
- `POST /api/v1/loki/query` when Loki labels endpoint returns 404: log lines still returned, no error

---

### Story 2.4: Log file upload

As a user,
I want to upload a local log file in `.log`, `.json`, or `.ndjson` format for analysis,
So that I can analyse logs from systems that are not connected to a Grafana/Loki instance.

**Acceptance Criteria:**

**Given** I select source type "File Upload" in the log source selector,
**When** I choose a `.log`, `.json`, or `.ndjson` file,
**Then** the file is sent via multipart form POST to `POST /api/v1/logs/upload` and enters the scrubbing pipeline on acceptance.

**Given** the uploaded file exceeds `MAX_LOG_SIZE_MB`,
**When** Fastify processes the multipart upload,
**Then** it returns RFC 7807 `413 Payload Too Large` before reading the full file body.

**Given** a `.json` or `.ndjson` file is uploaded,
**When** the content is parsed,
**Then** log lines are extracted from the structured format; if the file is malformed, a clear RFC 7807 error is returned and no content is cached.

**Given** an unsupported file type is selected (e.g., `.csv`),
**When** the upload is submitted,
**Then** client-side validation rejects the file and no request is sent.

**Given** the log source selector is rendered with all three source types available,
**When** I view the selector,
**Then** "File Upload" is the only available source type in MVP; the selector defaults to file upload without a source-type choice UI.

**Test Scenarios:**

*Unit (Vitest):*
- File type validator: `.log`, `.json`, `.ndjson` pass; `.csv`, `.xml` throw `UnsupportedFileTypeError`
- NDJSON parser: valid NDJSON extracts all lines; single malformed line throws `ParseError` with line number
- JSON parser: valid JSON array extracts all entries; non-array JSON throws `ParseError`
- File size check via `@fastify/multipart` limit: exceeding `MAX_LOG_SIZE_MB` throws before full read

*Integration (Vitest + Fastify test instance):*
- `POST /api/v1/logs/upload` with `.log` file: accepted, enters scrubbing pipeline
- `POST /api/v1/logs/upload` with `.ndjson` file: lines extracted and scrubbed
- `POST /api/v1/logs/upload` with oversized file: returns RFC 7807 413
- `POST /api/v1/logs/upload` with malformed `.json`: returns RFC 7807 422

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Upload `fixtures/sample.log`; confirm pipeline enters scrubbing stage
- Upload `fixtures/sample.ndjson`; confirm scrubbing initiated
- Attempt to upload a `.csv` file; confirm client-side rejection (no network request sent)

---

## Epic 3: Privacy Scrubbing & Redaction Review

Users are protected by automatic PII and secrets scrubbing before any log content reaches an LLM. They can review a summary of what was redacted, configure custom patterns, tune the precision/recall tradeoff, and re-run analysis on cached scrubbed logs without re-fetching.

### Story 3.1: Automatic PII and secrets scrubbing before LLM submission

As a user,
I want fetched or uploaded log content to be automatically scrubbed of PII and secrets before it can be submitted to an LLM,
So that sensitive data is never sent to an external service without my awareness.

**Acceptance Criteria:**

**Given** log content has arrived from the file upload source (or any future source),
**When** it passes size validation,
**Then** Fastify automatically calls `POST http://scrubber:8001/scrub` with the raw log text before any further processing; raw log content is never written to Redis.

**Given** the scrubber call succeeds,
**When** the response is received,
**Then** the `redacted_text` is stored in Redis under `scrub_cache:{userId}:{sessionId}` with TTL = `SESSION_TTL_SECONDS`; the raw log text is discarded from memory.

**Given** the scrubber service is unreachable or returns a non-200 response,
**When** the scrub call is made,
**Then** Fastify returns RFC 7807 `502 Bad Gateway`; no log content is cached and the user sees a clear error.

**Given** the scrubber call times out (after `SCRUBBER_TIMEOUT_MS`, default 30s),
**When** the timeout fires,
**Then** the request is aborted via AbortController and Fastify returns RFC 7807 `504 Gateway Timeout`.

**Test Scenarios:**

*Unit (Vitest):*
- `scrubCache.set()`: stores value in Redis with correct key pattern `scrub_cache:{userId}:{sessionId}` and TTL equal to `SESSION_TTL_SECONDS`
- `scrubCache.get()`: returns `null` for missing or expired key
- `scrubCache.del()`: removes key; subsequent `get` returns `null`
- Scrub route: aborts and returns 504 when scrubber exceeds `SCRUBBER_TIMEOUT_MS`
- Scrub route: returns 502 when scrubber returns non-200 response

*Integration (Vitest + real Redis + mock scrubber):*
- Valid log content: Fastify calls scrubber, stores `redacted_text` in Redis, raw text not present in Redis
- Scrubber returns 500: Fastify returns RFC 7807 502; no Redis key created
- Scrubber takes > `SCRUBBER_TIMEOUT_MS`: Fastify returns RFC 7807 504; no Redis key created

---

### Story 3.2: NER-based PII detection

As a user,
I want names, email addresses, phone numbers, physical addresses, account numbers, and dates to be detected and redacted from logs using the Privacy Filter NER model,
So that personally identifiable information is protected even when it appears in unstructured text.

**Acceptance Criteria:**

**Given** log content containing a person's name, email address, phone number, or physical address,
**When** the scrubbing pipeline runs,
**Then** each detected entity is replaced with a placeholder token in the format `[REDACTED_<ENTITY_TYPE>]`.

**Given** the Privacy Filter model,
**When** the `scrubber` container starts,
**Then** the model is loaded via `transformers.pipeline()` during the FastAPI lifespan startup hook — not on first request — so no cold-start latency occurs on the first scrub call.

**Given** a pytest test suite with a reference PII corpus,
**When** the test suite runs,
**Then** recall for known PII categories (name, email, phone, address) is ≥ 95% and the suite passes.

**Test Scenarios:**

*Unit (pytest — `scrubber/tests/test_privacy_filter.py`):*
- `PrivacyFilter.scrub()`: text with a person name returns `[REDACTED_PER]` in place of the name
- `PrivacyFilter.scrub()`: text with an email address returns `[REDACTED_EMAIL]`
- `PrivacyFilter.scrub()`: text with a phone number returns `[REDACTED_PHONE]`
- `PrivacyFilter.scrub()`: text with no PII returns text unchanged
- Recall suite: run against reference PII corpus (≥ 95% recall per category; fails CI if below threshold)

*Integration (pytest — `scrubber/tests/test_pipeline.py`):*
- Model is loaded during FastAPI `lifespan` startup; first `POST /scrub` request returns within 5 seconds (no cold-start)
- `POST /scrub` with multi-entity log text: response `redaction_summary` lists correct category counts

---

### Story 3.3: Pattern-based secrets detection

As a user,
I want API keys, tokens, credentials, and other secrets automatically detected and redacted from logs,
So that secrets embedded in log output cannot leak to an LLM or appear in analysis results.

**Acceptance Criteria:**

**Given** log content containing a recognisable secret pattern (API key, bearer token, AWS key, private key header),
**When** the scrubbing pipeline runs,
**Then** the secret is replaced with `[REDACTED_SECRET]`.

**Given** a pytest test suite with a reference secrets corpus (`e2e/fixtures/reference-secrets.txt`),
**When** the test suite runs,
**Then** recall for all reference secret patterns is 100% and the suite passes.

**Given** custom regex patterns are configured (Story 3.4),
**When** the scrubbing pipeline runs,
**Then** custom patterns are evaluated alongside the detect-secrets scanner; a match on either replaces the value with `[REDACTED_CUSTOM]`.

**Test Scenarios:**

*Unit (pytest — `scrubber/tests/test_detect_secrets.py`):*
- `SecretsScanner.scrub()`: text containing an AWS access key returns `[REDACTED_SECRET]`
- `SecretsScanner.scrub()`: text containing a bearer token returns `[REDACTED_SECRET]`
- `SecretsScanner.scrub()`: text with no secrets returns text unchanged
- 100% recall suite: every entry in `e2e/fixtures/reference-secrets.txt` is detected and redacted (fails CI if any entry missed)

*Integration (pytest — `scrubber/tests/test_pipeline.py`):*
- `POST /scrub` with text containing both a PII entity and a secret: both are redacted; `redaction_summary` lists both categories
- `POST /scrub` with `custom_patterns` set: custom match replaced with `[REDACTED_CUSTOM]` in addition to standard redactions

---

### Story 3.4: Custom regex patterns for organisation-specific sensitive data

As a user,
I want to configure custom regex patterns that flag organisation-specific sensitive strings for redaction,
So that internal identifiers, project codes, or proprietary formats that the default detectors don't know about are also scrubbed.

**Acceptance Criteria:**

**Given** I am on the analysis configuration screen,
**When** I add one or more custom regex patterns,
**Then** they are sent as `custom_patterns: string[]` in the `POST /api/v1/scrub` request body to Fastify, which forwards them to the scrubber.

**Given** a custom pattern is provided,
**When** the FastAPI pipeline evaluates it,
**Then** any match in the log content is replaced with `[REDACTED_CUSTOM]` in addition to all standard PII and secrets redactions.

**Given** a custom pattern is an invalid regex,
**When** the scrubber attempts to compile it,
**Then** FastAPI returns a 422 validation error identifying the invalid pattern; the scrub request is rejected and no partial results are returned.

**Given** I leave the custom patterns field empty,
**When** I submit the analysis,
**Then** the scrubber runs with only its default PII and secrets detectors; no error occurs.

**Test Scenarios:**

*Unit (pytest — `scrubber/tests/test_pipeline.py`):*
- `RegexRules.scrub()` with valid pattern matching input: returns `[REDACTED_CUSTOM]`
- `RegexRules.scrub()` with invalid regex string: raises `ValueError` with pattern identified
- `RegexRules.scrub()` with empty `custom_patterns` list: returns text unchanged, no error

*Unit (Vitest):*
- Scrub route: `custom_patterns` array is forwarded as-is in the scrubber request body
- Scrub route: empty `custom_patterns` omitted from request body (no error)

*Integration (Vitest + real scrubber):*
- `POST /api/v1/scrub` with `custom_patterns: ["PROJ-[0-9]+"]`: text containing `PROJ-1234` is replaced with `[REDACTED_CUSTOM]`
- `POST /api/v1/scrub` with invalid regex `custom_patterns: ["["]`: returns RFC 7807 422 identifying the pattern

---

### Story 3.5: Redaction review, precision/recall tuning, and session cache re-use

As a user,
I want to review a summary of what was redacted before submitting to the LLM, optionally adjust the scrubbing sensitivity, and re-run analysis on cached scrubbed logs without re-fetching,
So that I can understand what was removed, control false-positive/false-negative tradeoffs, and iterate on analysis efficiently.

**Acceptance Criteria:**

**Given** scrubbing completes successfully,
**When** the pipeline state transitions to `awaiting-review`,
**Then** the UI displays a redaction summary panel showing counts per category (e.g., `PII_NAME: 4`, `SECRET: 2`, `CUSTOM: 1`) derived from the scrubber's `redaction_summary` response field.

**Given** I am on the redaction review panel,
**When** I adjust the precision/recall slider,
**Then** a new scrub request is issued with the updated sensitivity parameter; the cache is updated with the new `redacted_text` and the summary refreshes.

**Given** I confirm the redaction review,
**When** I click "Proceed to Analysis",
**Then** the pipeline transitions from `awaiting-review` to `analysing` and the cached `redacted_text` is sent to the LLM — the raw logs are never re-fetched.

**Given** cached scrubbed logs exist in Redis for my session,
**When** I trigger a re-run analysis (without changing the log source),
**Then** Fastify retrieves `scrub_cache:{userId}:{sessionId}` from Redis and submits directly to the LLM; no Loki fetch or scrubber call is made.

**Given** my session expires or I log out,
**When** Redis TTL fires or the logout endpoint is called,
**Then** the `scrub_cache:{userId}:{sessionId}` key is deleted; a subsequent re-run attempt returns an RFC 7807 error indicating the cache has expired.

**Test Scenarios:**

*Unit (Vitest):*
- `RedactionReviewPanel`: renders category counts from `redaction_summary`; shows "0 redactions" when summary is empty
- Re-run route: calls `scrubCache.get()` and submits result to LLM without calling scrubber; returns 410 when key missing
- Precision/recall slider: emits new scrub request with updated `sensitivity` param on change

*Integration (Vitest + real Redis + mock scrubber + mock LLM):*
- After scrubbing, `scrub_cache:{userId}:{sessionId}` key exists in Redis with correct TTL
- Re-run request: Redis `GET` called; scrubber HTTP endpoint not called
- Re-run after TTL expiry (set short TTL in test): returns RFC 7807 410 `Gone`
- Logout: `scrub_cache:{userId}:*` keys deleted from Redis

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Complete scrub → redaction review panel shows category counts → click "Proceed" enters analysing state
- Re-run analysis from session history: no new fetch or scrub (pipeline jumps directly to analysing)

---

## Epic 4: AI-Powered Log Analysis

Users submit scrubbed logs to a configured LLM (remote or local) and receive streamed analysis: identified errors with frequency, anomaly patterns, root cause hypothesis, component timeline, and actionable next steps — all citing actual log excerpts and clearly labelled as AI-generated.

### Story 4.1: LLM provider configuration

As an administrator,
I want to configure a remote or local LLM provider via environment variables,
So that LogLens can send analysis requests to the correct endpoint without code changes across deployment contexts.

**Acceptance Criteria:**

**Given** `LLM_PROVIDER=openai` and `LLM_API_KEY` are set,
**When** the `api` container starts,
**Then** Zod env validation passes and the `LLMProvider` factory resolves an OpenAI-compatible client.

**Given** `LLM_PROVIDER=openai-compatible` and `LLM_BASE_URL` are set,
**When** an analysis request is made,
**Then** Fastify sends the chat completions request to `LLM_BASE_URL` using the OpenAI streaming API format; no OpenAI domain is contacted.

**Given** `LLM_BASE_URL` points to an LM Studio instance on the local network,
**When** an analysis request is made,
**Then** all LLM calls are made to that URL only; no external network calls occur during analysis.

**Given** `LLM_PROVIDER` is not set,
**When** a user attempts to start an analysis,
**Then** Fastify returns RFC 7807 `503 Service Unavailable` with a message indicating no LLM provider is configured.

**Given** all providers,
**When** the `LLMProvider` interface is called,
**Then** the method signature is `stream(prompt: string, signal: AbortSignal): AsyncIterable<string>` — no provider-specific code exists outside `api/src/services/llmProvider.ts`.

**Test Scenarios:**

*Unit (Vitest):*
- `llmProviderFactory(env)`: returns OpenAI client when `LLM_PROVIDER=openai`; returns OpenAI-compatible client when `LLM_PROVIDER=openai-compatible`
- `llmProviderFactory(env)`: throws `ConfigurationError` when `LLM_PROVIDER` is unset
- All providers implement `stream(prompt, signal): AsyncIterable<string>` interface (TypeScript compilation validates contract)
- Analysis route: returns RFC 7807 503 when `llmProviderFactory` throws `ConfigurationError`

*Integration (Vitest + mock LLM server):*
- `POST /api/v1/analysis-jobs` with `LLM_BASE_URL` pointing to mock server: request goes to mock URL, not OpenAI
- `POST /api/v1/analysis-jobs` when `LLM_PROVIDER` is unset: returns RFC 7807 503

---

### Story 4.2: LLM provider API key override from UI *(Post-MVP)*

As a user,
I want to supply my own LLM API key in the UI to override the server-configured key,
So that I can use my personal account or a project-specific key without administrator involvement.

**Acceptance Criteria:**

**Given** I am on the analysis configuration screen,
**When** I enter an API key in the override field,
**Then** it is sent as a request header to Fastify and used in place of `LLM_API_KEY` for that request only.

**Given** I provide an override key,
**When** Fastify processes the analysis request,
**Then** the override key is used for the LLM call and never logged, never stored in PostgreSQL, and never returned in any API response.

**Given** the override key field is left empty,
**When** I submit the analysis,
**Then** the server-configured `LLM_API_KEY` is used with no error.

**Given** a provided override key is rejected by the LLM provider (401),
**When** the stream is initiated,
**Then** Fastify returns RFC 7807 `401 Unauthorized` with a message indicating the key was rejected by the provider.

**Test Scenarios:**

*Unit (Vitest):*
- Analysis route: `x-llm-api-key` header present → used for LLM call; absent → falls back to `LLM_API_KEY` env var
- `stream()` called with override key: key passed in `Authorization` header; not present in Fastify access log
- Analysis route: LLM returns 401 → Fastify returns RFC 7807 401 with provider rejection message

*Integration (Vitest + mock LLM server):*
- Request with `x-llm-api-key` header: mock server receives the override key in Authorization
- Mock server rejects key with 401: Fastify returns RFC 7807 401; override key not in response body
- No `x-llm-api-key` header: mock server receives server-configured key

---

### Story 4.3: LLM analysis request and streamed token output

As a user,
I want to submit scrubbed logs for analysis and see the LLM's response stream to the screen token by token as it is generated,
So that I get immediate feedback and don't wait for a full response before seeing results.

**Acceptance Criteria:**

**Given** I click "Analyse" after confirming the redaction review,
**When** the analysis job is created,
**Then** `POST /api/v1/analysis-jobs` returns a job ID and the pipeline transitions to `analysing`.

**Given** a valid analysis job ID,
**When** I connect to `GET /api/v1/analysis-jobs/:id/stream`,
**Then** the response is `Content-Type: text/event-stream` and SSE token events begin within 5 seconds of the LLM call being initiated.

**Given** the LLM is streaming tokens,
**When** each token arrives,
**Then** Fastify forwards it as an SSE `event: token` with `data: { text: string }` and the UI appends it to the analysis output without re-rendering the full component tree.

**Given** the LLM stream completes,
**When** the final response is assembled,
**Then** Fastify validates the structured payload against the Zod output schema before emitting `event: complete`; a schema violation returns RFC 7807 `502` instead of a malformed complete event.

**Given** the LLM call fails mid-stream (network error or provider error),
**When** the stream breaks,
**Then** Fastify emits `event: error` with an RFC 7807 payload and the pipeline transitions to `error` state.

**Test Scenarios:**

*Unit (Vitest):*
- Analysis route: `POST /api/v1/analysis-jobs` returns `{ jobId }` and 201
- SSE route: response `Content-Type` is `text/event-stream`
- SSE emitter: each LLM token emitted as `event: token\ndata: {"text":"..."}\n\n`
- SSE emitter: on stream complete, validates payload against Zod schema before emitting `event: complete`; schema violation emits `event: error` instead
- Zod output schema: rejects payload missing `errors`, `anomalies`, `rootCause`, `timeline`, or `nextSteps` fields

*Integration (Vitest + mock LLM SSE server):*
- `GET /api/v1/analysis-jobs/:id/stream`: first token event received within 5 seconds
- Mock LLM streams 10 tokens: client receives 10 `event: token` events followed by `event: complete`
- Mock LLM returns malformed final JSON: client receives `event: error` with RFC 7807 body
- Mock LLM drops connection mid-stream: client receives `event: error`

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Full pipeline: select source → scrub → review → analyse → tokens stream into output area in real time

---

### Story 4.4: Structured analysis output — errors, anomalies, root cause, timeline

As a user,
I want the analysis output to clearly present identified errors with frequency, anomalous patterns, a root cause hypothesis with confidence, and a timeline of affected components,
So that I can quickly understand what went wrong and where to focus my investigation.

**Acceptance Criteria:**

**Given** the analysis completes,
**When** the `event: complete` payload is received,
**Then** the UI renders four distinct sections: "Errors & Frequency", "Anomalies", "Root Cause Hypothesis", and "Event Timeline".

**Given** the "Errors & Frequency" section,
**When** rendered,
**Then** each identified error type is shown with its occurrence count and a distribution indicator (e.g., time-based or component-based).

**Given** the "Root Cause Hypothesis" section,
**When** rendered,
**Then** the hypothesis text is accompanied by a confidence indicator (High / Medium / Low) and is visually distinct from factual log data.

**Given** the "Event Timeline" section,
**When** rendered,
**Then** events are ordered chronologically with component labels derived from the log content.

**Given** any section of the analysis output,
**When** rendered,
**Then** the output includes at least one actual log excerpt as evidence (cited inline) and carries a visible label "AI-generated — not authoritative".

**Test Scenarios:**

*Unit (Vitest):*
- `AnalysisOutput` component: renders "Errors & Frequency", "Anomalies", "Root Cause Hypothesis", and "Event Timeline" sections when given a complete payload
- `AnalysisOutput` component: each error entry shows name + count + distribution indicator
- `AnalysisOutput` component: root cause section renders confidence badge (High/Medium/Low)
- `AnalysisOutput` component: timeline entries are in ascending timestamp order
- `AnalysisOutput` component: "AI-generated — not authoritative" label is present in rendered output

*Integration (Vitest + mock LLM):*
- `event: complete` payload satisfying Zod schema: all four sections populated in SSE event
- At least one log excerpt citation present in `errors` or `rootCause` field of payload

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- After analysis completes, all four sections are visible in the DOM
- "AI-generated — not authoritative" label is visible on the analysis view
- Confidence indicator (High/Medium/Low) is present in the root cause section

---

### Story 4.5: Recommended next steps

As a user,
I want the analysis to conclude with recommended next steps based on the identified errors and root cause,
So that I have concrete actions to investigate or remediate the issue without having to formulate follow-up prompts.

**Acceptance Criteria:**

**Given** the analysis completes,
**When** the `event: complete` payload is received,
**Then** the UI renders a "Recommended Next Steps" section as an ordered list of actionable items.

**Given** the next steps section,
**When** rendered,
**Then** each step references specific log evidence or analysis findings from the same session (not generic advice).

**Given** the LLM returns a `complete` payload with no recommended steps,
**When** Zod validates the payload,
**Then** validation fails and Fastify emits `event: error` rather than rendering an empty steps section.

**Given** the complete analysis output (all sections including next steps),
**When** displayed,
**Then** a persistent "AI-generated — not authoritative" banner is visible at the top of the analysis view and cannot be dismissed.

**Test Scenarios:**

*Unit (Vitest):*
- `AnalysisOutput` component: renders "Recommended Next Steps" ordered list when payload includes `nextSteps` array
- `AnalysisOutput` component: each next-step item references a finding string from the same payload
- Zod output schema: rejects `complete` payload where `nextSteps` is an empty array
- `AnalysisOutput` component: banner element has no dismiss/close button in rendered output

*Integration (Vitest + mock LLM):*
- `event: complete` with empty `nextSteps: []`: Fastify emits `event: error` instead of `event: complete`
- `event: complete` with non-empty `nextSteps`: SSE `complete` event emitted; client receives next steps

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- "Recommended Next Steps" section visible after analysis completes
- "AI-generated — not authoritative" banner present and no dismiss button found in DOM
- `@axe-core/playwright` accessibility check passes on the full analysis view

---

## Epic 5: Pipeline UX & Session Experience

Users experience a responsive, real-time pipeline: per-stage progress indicators, in-flight cancellation, a non-blocking UI throughout all long-running operations, and access to analysis history for the current session.

### Story 5.1: Per-stage pipeline progress indicators

As a user,
I want to see a clear progress indicator for each stage of the analysis pipeline as it runs,
So that I always know what the system is doing and can see that it hasn't stalled.

**Acceptance Criteria:**

**Given** I submit a log source for analysis,
**When** the pipeline state machine transitions through stages,
**Then** the UI renders a stage indicator that visually reflects the current state: `idle → fetching → scrubbing → awaiting-review → analysing → streaming → complete` (or `error` / `cancelled`).

**Given** the pipeline enters the `fetching` state,
**When** the progress indicator renders,
**Then** a visible activity indicator appears within 1 second of submission and shows "Fetching logs…".

**Given** the pipeline enters the `scrubbing` state,
**When** the progress indicator renders,
**Then** it shows "Scrubbing for PII and secrets…" with the previous stage marked complete.

**Given** the pipeline enters the `analysing` or `streaming` state,
**When** the progress indicator renders,
**Then** it shows "Analysing with LLM…" and the analysis output area becomes visible with streaming tokens appearing in real time.

**Given** the pipeline reaches `complete`,
**When** the progress indicator renders,
**Then** all stages are marked complete and the full structured analysis output is displayed.

**Given** the pipeline enters `error` state,
**When** the progress indicator renders,
**Then** the failing stage is highlighted with the RFC 7807 error `detail` message displayed inline; previous completed stages remain marked complete.

**Test Scenarios:**

*Unit (Vitest):*
- `useAnalysisPipeline` reducer: `idle → fetching` on `SUBMIT` action
- `useAnalysisPipeline` reducer: `fetching → scrubbing` on `FETCH_COMPLETE` action
- `useAnalysisPipeline` reducer: `scrubbing → awaiting-review` on `SCRUB_COMPLETE` action
- `useAnalysisPipeline` reducer: `awaiting-review → analysing` on `REVIEW_CONFIRMED` action
- `useAnalysisPipeline` reducer: `analysing → streaming` on first `TOKEN` action
- `useAnalysisPipeline` reducer: `streaming → complete` on `COMPLETE` action
- `useAnalysisPipeline` reducer: any active state → `error` on `ERROR` action; completed stages preserved
- `PipelineProgress` component: renders stage label matching current state; completed stages marked with done indicator
- `PipelineProgress` component: activity indicator visible in `fetching` state; label reads "Fetching logs…"

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Progress indicator transitions through `fetching → scrubbing → awaiting-review → analysing → complete` during full pipeline run
- On simulated scrubber error, `scrubbing` stage shows error state; `fetching` stage remains marked complete

---

### Story 5.2: In-flight analysis cancellation

As a user,
I want to cancel an analysis that is currently running,
So that I can abort a long-running or unwanted operation and start fresh without waiting for it to complete.

**Acceptance Criteria:**

**Given** the pipeline is in any active state (`fetching`, `scrubbing`, `analysing`, `streaming`),
**When** a "Cancel" button is visible and I click it,
**Then** the UI sends `DELETE /api/v1/analysis-jobs/:id` to Fastify.

**Given** Fastify receives the cancel request,
**When** it is processed,
**Then** the AbortController signal is triggered for all in-flight operations (Loki fetch, scrubber HTTP call, or LLM stream), and the Redis scrub-cache key for the job is deleted.

**Given** cancellation completes,
**When** the pipeline state updates,
**Then** the state transitions to `cancelled`, the progress indicator reflects this, and the "Cancel" button is replaced with a "Start New Analysis" button.

**Given** the pipeline is in `idle`, `awaiting-review`, or `complete` state,
**When** the UI renders,
**Then** no "Cancel" button is shown.

**Given** a cancel request arrives after the job has already completed,
**When** Fastify processes it,
**Then** it returns 204 No Content (idempotent); no error is raised.

**Test Scenarios:**

*Unit (Vitest):*
- `DELETE /api/v1/analysis-jobs/:id`: triggers `AbortController.abort()` on the job's signal
- `DELETE /api/v1/analysis-jobs/:id`: calls `scrubCache.del(userId, sessionId)`
- `DELETE /api/v1/analysis-jobs/:id`: returns 204 when job is already complete (idempotent)
- `useAnalysisPipeline` reducer: `CANCEL` action from any active state → `cancelled`; from `idle`/`complete` → no transition

*Integration (Vitest + mock Loki + mock LLM):*
- Cancel during `fetching`: Loki HTTP request aborted; pipeline state → `cancelled`
- Cancel during `analysing`: LLM SSE stream closes; pipeline state → `cancelled`; Redis scrub-cache key deleted
- Cancel on already-complete job: returns 204, no error

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Click "Cancel" during active analysis; progress indicator shows `cancelled`; "Start New Analysis" button appears

---

### Story 5.3: Non-blocking UI during long-running operations

As a user,
I want the UI to remain fully interactive while a fetch, scrub, or LLM analysis is running,
So that I can navigate, review past results, or adjust settings without waiting for the pipeline to finish.

**Acceptance Criteria:**

**Given** the pipeline is in any active state,
**When** I navigate to the data sources panel,
**Then** the data source list loads and is interactive; the running pipeline continues in the background.

**Given** the pipeline is in any active state,
**When** I interact with any non-analysis UI element (navigation, settings),
**Then** the browser main thread is not blocked; no UI freezes or jank occurs during fetch, scrub, or LLM streaming operations.

**Given** the LLM is streaming tokens,
**When** new tokens arrive,
**Then** they are appended to the output via a React state update that does not cause the pipeline progress indicator or other UI regions to re-render unnecessarily.

**Given** a Vitest test for the `useAnalysisPipeline` reducer,
**When** the test suite runs,
**Then** every state transition (`idle → fetching`, `fetching → scrubbing`, etc.) is covered by at least one test and the suite passes.

**Test Scenarios:**

*Unit (Vitest):*
- `useAnalysisPipeline` reducer: all 9 state transitions covered (see Story 5.1 unit tests — shared reducer; no duplication needed)
- `useAnalysisStream` hook: new SSE token appended to output string without triggering a re-render of `PipelineProgress` component (React testing library `renderCount` assertion)

*Integration (Vitest + Fastify test instance + mock LLM):*
- While SSE stream is active, `GET /api/v1/data-sources` returns 200 (Fastify handles concurrent requests)

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- While analysis is streaming, navigate to data sources panel; list loads and is interactive; streaming continues in background tab/panel
- During active streaming, verify no `page.freeze()` or JS error in browser console

---

### Story 5.4: Session analysis history *(Post-MVP)*

As a user,
I want to view a list of analyses I have run in the current session and revisit their results,
So that I can compare outputs from multiple runs or return to an earlier result without re-running the full pipeline.

**Acceptance Criteria:**

**Given** I have completed one or more analyses in the current session,
**When** I open the session history panel,
**Then** I see a list of entries showing the log source name, analysis timestamp, and status (complete / error / cancelled) for each run.

**Given** I click an entry in the session history,
**When** the analysis view loads,
**Then** the full structured output for that run is displayed without re-running any pipeline stage.

**Given** a session history entry whose Redis cache has expired (session TTL elapsed),
**When** I click that entry,
**Then** the UI shows a message indicating the cached data has expired and offers to re-fetch from the original source.

**Given** I log out,
**When** the logout completes,
**Then** the session history is cleared from the UI and is not accessible to the next authenticated user.

**Given** the session has no prior analyses,
**When** the history panel renders,
**Then** an empty state with a prompt to start a new analysis is shown.

**Test Scenarios:**

*Unit (Vitest):*
- `SessionHistory` component: renders list of entries with source name, timestamp, and status badge when given history array
- `SessionHistory` component: renders empty state when history array is empty
- `SessionHistory` component: entry with `status: error` renders error badge; entry with `status: cancelled` renders cancelled badge
- `useAnalysisPipeline` reducer: `COMPLETE` action appends entry to `history` array with correct metadata

*Integration (Vitest + real Redis + mock LLM):*
- After two completed analyses, session history contains two entries
- Clicking history entry for an expired cache key: `GET /api/v1/analysis-jobs/:id` returns RFC 7807 410; UI shows expiry message
- After logout, subsequent authenticated session has empty history

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Run two analyses; history panel shows both entries with correct status
- Click first entry; full analysis output displayed without pipeline re-running
- Log out; log back in; history panel is empty

---

## Epic 6: Frontend Application UI

All user-facing screens are implemented from functional skeletons to a complete, navigable application. Developer is free to choose visual styles; stories define user flows and required screen elements only. Accessibility requirements (WCAG 2.1 AA, keyboard navigation, screen reader compatibility) apply across all stories in this epic.

### Story 6.1: Application shell and authenticated navigation layout

As an authenticated user,
I want to see a consistent application shell with navigation and user controls on every protected page,
So that I can move between areas of the app and always know who I am logged in as and how to log out.

**Screen elements:**
- `AppHeader`: LogLens brand link, "Dashboard" and "Analysis" nav links with active state, logged-in username display, logout button
- `AppShell`: layout wrapper rendering header + `<Outlet />` for all authenticated routes
- `NotFound`: "Page not found" heading + "Return to Dashboard" link
- `ErrorBoundary`: "Something went wrong" recovery screen for uncaught render errors

**Acceptance Criteria:**

**Given** I am authenticated and navigate to any protected route,
**When** the page loads,
**Then** the `AppHeader` is visible with the LogLens name, navigation links, my username, and a logout button.

**Given** I click the logout button,
**When** the request completes,
**Then** the JWT cookie is cleared and I am redirected to `/login`.

**Given** I navigate to an unknown route,
**When** the page renders,
**Then** I see a "Page not found" message and a link back to `/`.

**Test Scenarios:**

*Unit (Vitest):*
- `AppHeader`: renders brand name "LogLens"
- `AppHeader`: renders "Dashboard" and "Analysis" navigation links
- `AppHeader`: logout button click calls `logout()` and navigates to `/login`
- `NotFound`: renders "Page not found" heading and "Return to Dashboard" link

*E2E (Playwright):*
- Authenticated user sees header with username and logout button on `/` and `/analysis`
- Clicking logout from header redirects to `/login`
- Navigating to `/nonexistent` shows "Page not found"

---

### Story 6.2: Authentication screens — login and first-run setup

As a user,
I want the login and first-run setup screens to clearly present the app identity and guide me through the form,
So that I can authenticate or create my admin account with confidence and recover from errors without confusion.

**Screen elements — login:** LogLens heading + tagline, username/password fields, "Sign in" button (loading state), `role="alert"` error area, OIDC-only variant with SSO button.

**Screen elements — setup:** "Welcome to LogLens" heading, subtitle, username/password fields, password hint ("Must be at least 12 characters"), per-field inline errors, "Create account" button (loading state).

**Acceptance Criteria:**

**Given** I navigate to `/login`,
**When** the page loads,
**Then** I see the LogLens heading and a sign-in form with username field, password field, and "Sign in" button.

**Given** I submit with wrong credentials,
**When** the 401 response arrives,
**Then** a `role="alert"` error message "Invalid credentials" appears.

**Given** I navigate to `/setup`,
**When** the page loads,
**Then** I see "Welcome to LogLens", the subtitle, and a "Create account" button.

**Given** I submit the setup form with a password shorter than 12 characters,
**When** the form validates,
**Then** an inline error appears below the password field before any API call is made.

**Test Scenarios:**

*Unit (Vitest):*
- `LoginForm`: renders username field, password field, and "Sign in" button
- `LoginForm`: displays `role="alert"` error after simulated 401
- `LoginForm` (OIDC): renders SSO button; no username/password form when `VITE_OIDC_ENABLED=true`
- `FirstRunWizard`: renders "Welcome to LogLens" heading and "Create account" button
- `FirstRunWizard`: shows per-field error for password < 12 chars; no API call made

*E2E (Playwright — existing `auth.spec.ts` tests must continue to pass)*

---

### Story 6.3: Dashboard home screen

As an authenticated user,
I want the dashboard to welcome me by name and give me a clear entry point for starting an analysis,
So that I land somewhere meaningful after login and can begin working in one click.

**Screen elements:** Welcome heading with username, LogLens description paragraph, "Start New Analysis" CTA button/link navigating to `/analysis`.

**Acceptance Criteria:**

**Given** I am authenticated and navigate to `/`,
**When** the page loads,
**Then** I see a welcome heading that includes my username and a "Start New Analysis" button.

**Given** I click "Start New Analysis",
**When** navigation occurs,
**Then** I arrive at `/analysis`.

**Test Scenarios:**

*Unit (Vitest):*
- `DashboardPage`: renders welcome heading with mocked username
- `DashboardPage`: renders loading placeholder while `getMe()` is pending
- `DashboardPage`: "Start New Analysis" link points to `/analysis`

*E2E (Playwright):*
- After login, `/` shows "Start New Analysis" element; clicking it navigates to `/analysis`

---

### Story 6.4: Analysis workflow UI — file upload, pipeline progress, and redaction review

As a user,
I want the analysis page to guide me clearly through uploading my log file and reviewing what was scrubbed before analysis starts,
So that I understand each step and can make an informed decision before sending data to the LLM.

**Screen elements — upload area:** "Analyze Logs" page heading, log source selector ("Upload File" active / "Loki Query" disabled + "Post-MVP" badge), drag-and-drop zone with file info display, accepted formats, file size limit note, "Analyze logs" submit button (disabled until file selected).

**Screen elements — pipeline progress:** 4 stages (Fetching / Scrubbing / Analysing / Complete) with active/completed/pending indicators.

**Screen elements — redaction review:** "Review before analysis" heading, descriptive line, per-category count list (e.g. "EMAIL — 3 removed"), empty state text, "Confirm and analyze" button, "Cancel and start over" button.

**Acceptance Criteria:**

**Given** I navigate to `/analysis` in `idle` state,
**When** the page loads,
**Then** I see "Analyze Logs" heading, log source selector, drop zone, and a disabled "Analyze logs" button.

**Given** I select a file,
**When** the file is chosen,
**Then** the drop zone shows file name and size and the "Analyze logs" button becomes enabled.

**Given** upload and scrubbing complete,
**When** the pipeline is `awaiting-review`,
**Then** `RedactionReviewPanel` is visible with "Review before analysis" heading and "Confirm and analyze" button.

**Given** I click "Cancel and start over" on the review panel,
**When** the action completes,
**Then** the pipeline resets to `idle` and the upload form appears.

**Test Scenarios:**

*Unit (Vitest):*
- `FileUpload`: "Analyze logs" button disabled with no file; enabled after file selected
- `FileUpload`: shows file name and size after selection; "×" remove button clears file
- `FileUpload`: displays accepted formats and size limit note
- `RedactionReviewPanel`: renders "Review before analysis" heading
- `RedactionReviewPanel`: "Cancel and start over" button calls `onCancel`

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Upload drop zone visible; "Analyze logs" disabled on arrival; enabled after file select
- Redaction review panel appears with "Confirm and analyze" button after upload + scrub
- "Cancel and start over" resets view to upload drop zone

---

### Story 6.5: Analysis streaming display and structured results screen

As a user,
I want to watch LLM tokens stream in real time and then read the structured findings in clearly organised sections,
So that I get immediate feedback while waiting and can quickly locate root cause, errors, and next steps when results arrive.

**Screen elements — streaming:** Scrollable live stream container (auto-scroll to bottom), "Cancel analysis" button visible throughout, optional "Raw output" label.

**Screen elements — structured results:** AI disclaimer banner (non-dismissable), five sections (Errors & Frequency / Anomalies / Root Cause Hypothesis with confidence badge and evidence blockquotes / Event Timeline / Recommended Next Steps as `<ol>`), empty states per section, "Start new analysis" button at bottom.

**Acceptance Criteria:**

**Given** the pipeline is `streaming`,
**When** tokens arrive,
**Then** the live stream area is visible and auto-scrolls; "Cancel analysis" button is visible.

**Given** the pipeline reaches `complete`,
**When** the `event: complete` SSE payload arrives,
**Then** `AnalysisOutput` renders with AI disclaimer as the first element and all five result sections.

**Given** I click "Start new analysis",
**When** the action completes,
**Then** the pipeline resets to `idle` and the upload form appears.

**Test Scenarios:**

*Unit (Vitest):*
- `AnalysisView`: live stream container renders `streamOutput` text in `streaming` state
- `AnalysisView`: "Start new analysis" button visible in `complete` state; click resets to `idle`
- `CancelButton`: label is "Cancel analysis" during `streaming`; "Start new analysis" during `complete`
- `AnalysisOutput`: renders all five section headings
- `AnalysisOutput`: Root Cause evidence excerpts are in `<blockquote>` elements
- `AnalysisOutput`: "Event Timeline" shows "No timeline data." when array is empty
- `AnalysisOutput`: "Recommended Next Steps" renders as `<ol>`

*E2E (Playwright — `e2e/analysis.spec.ts`):*
- Full happy path: upload → confirm → analysis completes → all five sections visible
- "Start new analysis" button visible after complete; clicking it resets to upload view
