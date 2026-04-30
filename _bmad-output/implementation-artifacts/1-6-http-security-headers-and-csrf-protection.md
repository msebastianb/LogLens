# Story 1.6: HTTP Security Headers and CSRF Protection

Status: done

## Story

As a security-conscious administrator,
I want LogLens to emit security headers and enforce CSRF protection on all state-mutating endpoints,
So that the application is hardened against XSS, clickjacking, and CSRF without additional configuration.

## Acceptance Criteria

**AC1 — Security headers on every response:**
**Given** any Fastify API response,
**When** the response headers are inspected,
**Then** `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security` are present.

**AC2 — CSRF protection on state-mutating endpoints (non-localhost):**
**Given** a POST, PUT, or DELETE API request without a valid CSRF token,
**When** the request hits a non-exempt endpoint on a production/HTTPS-only deployment,
**Then** Fastify returns 403.

**AC3 — CSRF token endpoint:**
**Given** any client (authenticated or not),
**When** `GET /api/v1/csrf/token` is called,
**Then** a CSRF token is returned in the response body `{ token }` and a `_csrf` cookie is set.

**AC4 — Login and setup endpoints are CSRF-exempt:**
**Given** `POST /api/v1/auth/login` or `POST /api/v1/setup`,
**When** the request lacks a CSRF token,
**Then** the request is processed normally (these are pre-auth endpoints; CSRF can't apply).

**AC5 — Credentials never appear in logs:**
**Given** the application is processing requests,
**When** Fastify logs are inspected,
**Then** `authorization`, `cookie`, `x-api-key`, and `x-llm-api-key` headers are replaced with `[REDACTED]` in all log output.

## Tasks / Subtasks

- [x] Task 1 — Extract Helmet into a plugin (AC1)
  - [x] Create `api/src/plugins/helmet.ts` — Fastify plugin wrapped with `fp()`:
    - Move existing `@fastify/helmet` registration from `app.ts` into this plugin
    - Same CSP config: `defaultSrc 'self'`, `scriptSrc 'self'`, `styleSrc 'self' 'unsafe-inline'`, `imgSrc 'self' data:`, `connectSrc 'self' + LLM_BASE_URL`, `frameSrc 'none'`, `objectSrc 'none'`
    - `crossOriginEmbedderPolicy: false` (preserve existing)
    - HSTS: enabled by default via `@fastify/helmet` — no extra config needed
    - Added `frameguard: { action: 'deny' }` explicitly (helmet v13 defaults to SAMEORIGIN)
  - [x] Update `api/src/app.ts` — replace inline `app.register(helmet, ...)` call with `app.register(helmetPlugin)`

- [x] Task 2 — Create CSRF plugin (AC2, AC3, AC4)
  - [x] Create `api/src/plugins/csrf.ts` — Fastify plugin wrapped with `fp()`:
    - Register `@fastify/csrf-protection` with `@fastify/cookie` backend (no extra `sessionPlugin` option — defaults to cookie mode)
    - Add `GET /api/v1/csrf/token` route: calls `await reply.generateCsrf()` and returns `{ token }`
    - Add global `onRequest` hook that enforces `app.csrfProtection` ONLY when:
      1. `env.NODE_ENV === 'production' || env.HTTPS_ONLY === true`
      2. Request method is POST, PUT, PATCH, or DELETE
      3. Route is NOT exempt:
         - `POST /api/v1/auth/login`
         - `POST /api/v1/setup`
    - Use `req.routeOptions?.url` for exempt matching (handles path params correctly)
    - callback-style `csrfProtection(req, reply, done)` for correct Fastify v5 hook integration
  - [x] Update `api/src/app.ts` — register `csrfPlugin` AFTER `cookie` but BEFORE routes

- [x] Task 3 — Frontend CSRF token injection (AC2, AC3)
  - [x] Update `frontend/src/lib/apiClient.ts`:
    - Module-level `let csrfToken: string | null = null`
    - `async function getCsrfToken()` — lazy-init; `GET /api/v1/csrf/token` on first call; cached
    - `apiPost` injects `x-csrf-token` header; clears cache on 403

- [x] Task 4 — Unit tests (AC1, AC2, AC4, AC5)
  - [x] `api/src/plugins/helmet.test.ts` — 4 tests: CSP, X-Frame-Options DENY, nosniff, HSTS
  - [x] `api/src/plugins/csrf.test.ts` — 5 tests: token endpoint, 403 without token, 200 with token, 2 exemption tests
  - [x] `api/src/app.test.ts` — 2 tests: log redaction of authorization + cookie headers

- [x] Task 5 — Integration tests (AC1, AC5)
  - [x] `api/src/routes/health.integration.test.ts` — added `security headers integration` describe block (3 tests using `buildApp()`): CSP header, X-Frame-Options DENY, X-Content-Type-Options nosniff

- [x] Task 6 — E2E smoke (AC1)
  - [x] `e2e/auth.spec.ts` — added `security headers smoke` describe: `/health` API call verifies CSP header present

## Dev Notes

### Context: What's Already Done vs What This Story Adds

| Concern | Current State | This Story |
|---------|---------------|------------|
| `@fastify/helmet` | ✅ Registered inline in `app.ts` | Extract to `plugins/helmet.ts` |
| `@fastify/csrf-protection` | ❌ Not registered anywhere | Create `plugins/csrf.ts` |
| Log `redact` config | ✅ Already in `app.ts` `Fastify({logger:{redact:...}})` | Write unit test only |
| Frontend CSRF injection | ❌ Stub comment in `apiClient.ts` | Implement lazy-init pattern |

### Current `app.ts` Helmet Registration (to be moved)

```typescript
// Current inline in app.ts — MOVE to plugins/helmet.ts
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", ...(env.LLM_BASE_URL ? [env.LLM_BASE_URL] : [])],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
})
```

### Plugin Architecture Rules

Both plugins MUST use `fp()` (`fastify-plugin`) wrapper:
- `helmPlugin` — not strictly required (no decorators) but consistent with the rest of the plugin folder
- `csrfPlugin` — **required** — `reply.generateCsrf()` and `fastify.csrfProtection` must be visible in parent Fastify scope

```typescript
import fp from 'fastify-plugin'
export default fp(async function helmetPlugin(app) { ... })
```

### `app.ts` Plugin Registration Order (after this story)

```typescript
// Security plugins — helmet FIRST (before anything that might send responses)
await app.register(helmetPlugin)

// CORS (after helmet)
await app.register(cors, { ... })

// Cookie MUST be before JWT (JWT reads cookies) AND before CSRF (CSRF uses cookies)
await app.register(cookie)
await app.register(jwt, { ... })

// CSRF plugin AFTER cookie (depends on cookie for _csrf secret storage)
await app.register(csrfPlugin)

await app.register(sensible)
await app.register(authPlugin)
// ... routes ...
```

### CSRF Plugin Design Details

```typescript
// Key decisions:
// 1. @fastify/csrf-protection v7 + @fastify/cookie v9: no sessionPlugin option needed
//    (cookie mode is the default when @fastify/cookie is registered)
// 2. CSRF token returned from GET /api/v1/csrf/token, stored in _csrf cookie (httpOnly: false
//    is the default so the browser can send it back in subsequent requests)
// 3. The onRequest hook must use req.routeOptions?.url for exempt matching,
//    NOT req.url (which includes query strings and is not normalized for path params)

const CSRF_EXEMPT_PATTERNS = new Set([
  '/api/v1/auth/login',
  '/api/v1/setup',
])

app.addHook('onRequest', async (req, reply) => {
  const stateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
  if (!stateChanging) return
  const routePattern = req.routeOptions?.url ?? req.url
  if (CSRF_EXEMPT_PATTERNS.has(routePattern)) return
  return app.csrfProtection(req, reply)
})
```

### Frontend CSRF Token Pattern

```typescript
// api/src/lib/apiClient.ts additions

let csrfToken: string | null = null

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  const res = await fetch('/api/v1/csrf/token', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch CSRF token')
  const data = await res.json() as { token: string }
  csrfToken = data.token
  return csrfToken
}

// In apiPost: add to headers
// headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() }

// On 403: clear token so next request re-fetches
// if (res.status === 403) { csrfToken = null }
```

### `@fastify/csrf-protection` v7 API Reference

- Installs via `@fastify/cookie` (no `sessionPlugin` option needed)
- `reply.generateCsrf([opts])` → `Promise<string>` (sets `_csrf` cookie, returns HMAC token)
- `fastify.csrfProtection(req, reply, next)` — hook to add to `onRequest`
- Default token lookup: reads `x-csrf-token` header (or body `_csrf`, or `csrf-token`, etc.)
- Returns 403 if token missing or invalid

### Log Redaction — Already Implemented

The `redact` paths in `app.ts` are:
```typescript
redact: {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'req.headers["x-llm-api-key"]',
  ],
  censor: '[REDACTED]',
}
```
This story only needs to VERIFY these paths via unit test — do NOT move/change the config.

### Test Patterns — vi.mock for env

All test files that import `app.ts` or `plugins/csrf.ts` (which reads `env.NODE_ENV`) must mock env:
```typescript
vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
    SESSION_TTL_SECONDS: 28800,
    NODE_ENV: 'production',  // Force CSRF enforcement on
    HTTPS_ONLY: false,
    LOG_LEVEL: 'silent',
    LLM_BASE_URL: undefined,
  },
}))
```

### Log Redaction Unit Test Pattern

```typescript
import { Writable } from 'node:stream'

it('redacts authorization header from logs', async () => {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) { lines.push(chunk.toString()); cb() }
  })
  const app = Fastify({
    logger: {
      level: 'info',
      stream,
      redact: {
        paths: ['req.headers.authorization'],
        censor: '[REDACTED]',
      },
    },
  })
  app.get('/ping', async () => ({ ok: true }))
  await app.inject({ url: '/ping', headers: { authorization: 'Bearer supersecrettoken' } })
  await app.close()
  const allLogs = lines.join('\n')
  expect(allLogs).not.toContain('supersecrettoken')
  expect(allLogs).toContain('[REDACTED]')
})
```

### Files to CREATE (new)

| File | Purpose |
|------|---------|
| `api/src/plugins/helmet.ts` | Extracted `@fastify/helmet` plugin with CSP config |
| `api/src/plugins/csrf.ts` | `@fastify/csrf-protection` + token endpoint + conditional enforcement hook |
| `api/src/plugins/helmet.test.ts` | Unit tests: verify CSP, X-Frame-Options, nosniff, HSTS headers |
| `api/src/plugins/csrf.test.ts` | Unit tests: token endpoint, protection enforcement, exemptions |
| `api/src/app.test.ts` | Unit test: log redaction verifies `[REDACTED]` censor |

### Files to UPDATE (existing)

| File | What changes |
|------|-------------|
| `api/src/app.ts` | Replace inline `app.register(helmet, ...)` → `app.register(helmetPlugin)`; add `app.register(csrfPlugin)` after cookie |
| `frontend/src/lib/apiClient.ts` | Implement `getCsrfToken()` lazy-init; inject `x-csrf-token` in `apiPost`; clear on 403 |
| `api/src/routes/health.integration.test.ts` | Add describe block using `buildApp()` to verify CSP header |

### Cross-Story Continuity

- Story 1.4 added `api/src/plugins/auth.ts` — follows same `fp()` pattern to adopt here
- `fastify-plugin` (`fp`) is already in `api/package.json` (used by auth.ts)
- `@fastify/helmet`, `@fastify/csrf-protection`, `@fastify/cors` all in `api/package.json` AND installed in `node_modules`
- `HTTPS_ONLY` env var already in `api/src/config/env.ts` (Zod schema, boolean coercion from `'true'`)
- Story 2.1 will add the first CSRF-enforced route (`POST /api/v1/data-sources`) — integration test for CSRF enforcement deferred to 2.1

### Review Findings

- [x] [Review][Patch] P1 — HSTS emitted over plain HTTP in development — helmetPlugin registered unconditionally; HSTS header causes permanent browser pin on dev hostnames [api/src/plugins/helmet.ts]
- [x] [Review][Patch] P2 — CSRF bypass condition is NODE_ENV-based not network-based — staging/preview with NODE_ENV=development has zero CSRF enforcement even when publicly reachable [api/src/plugins/csrf.ts]
- [x] [Review][Patch] P3 — _csrf cookie missing Secure flag — @fastify/csrf-protection default does not set secure:true; secret cookie transmitted over plain HTTP in misconfigured deployments [api/src/plugins/csrf.ts]
- [x] [Review][Patch] P4 — No CSRF enforcement tests for PUT or DELETE — AC2 explicitly names PUT and DELETE; STATE_CHANGING_METHODS includes them but no tests verify [api/src/plugins/csrf.test.ts]
- [x] [Review][Patch] P5 — Redaction unit tests construct fresh Fastify instance inline, not via buildApp() — tests pass even if app.ts redact config is wrong [api/src/app.test.ts]
- [x] [Review][Patch] P6 — x-api-key and x-llm-api-key redaction paths not covered by tests — only authorization and cookie tested (AC5 partial) [api/src/app.test.ts]
- [x] [Review][Patch] P7 — CSRF exempt-route fallback uses req.url including query strings — unmatched route POSTs with ?query get 403 instead of 404, leaking method enforcement details [api/src/plugins/csrf.ts — onRequest hook]

- [x] [Review][Defer] D1 — HSTS not explicitly configured — relies on helmet default; stable across current major — deferred, document dependency on helmet default

### CSRF and SPA Architecture Note

LogLens is a SPA with a Fastify API. The browser sends the `token` JWT cookie (httpOnly) for auth, and the `_csrf` cookie (readable by JS or just stored by browser) for CSRF protection. The frontend must:
1. `GET /api/v1/csrf/token` once on app start (or lazily before first POST)
2. Store the returned token string
3. Send as `x-csrf-token` on every mutation

The `_csrf` cookie does NOT need to be `httpOnly: false` explicitly — the default `@fastify/csrf-protection` behavior sets a browser cookie that the server reads to validate against the token. The client-side JS only needs to cache the returned `token` string.
