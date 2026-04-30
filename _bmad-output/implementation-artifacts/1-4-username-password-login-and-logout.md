# Story 1.4: Username/password login and logout

Status: done

## Story

As a user,
I want to log in with my username and password,
So that I can access LogLens when no OIDC provider is configured.

## Acceptance Criteria

**AC1 — Successful login:**
**Given** valid credentials,
**When** I submit the login form,
**Then** a httpOnly signed JWT is set as a cookie and I am redirected to the dashboard.

**AC2 — Invalid credentials:**
**Given** invalid credentials,
**When** I submit the login form,
**Then** a generic "Invalid credentials" error is shown — no indication of whether username or password was wrong.

**AC3 — Expired/tampered JWT:**
**Given** an expired or tampered JWT,
**When** I access a protected route,
**Then** I am redirected to `/login`.

**AC4 — Logout:**
**Given** I click "Log out",
**When** the request is processed,
**Then** the JWT cookie is cleared, the server-side session is invalidated, and any Redis scrub-cache keys for my session are deleted.

**AC5 — OIDC configured:**
**Given** `OIDC_ISSUER_URL` env var is set,
**When** I navigate to `/login`,
**Then** the username/password form is hidden and only the SSO button is shown.

## Tasks / Subtasks

- [x] Task 1 — `verifyPassword()` service function (AC1, AC2)
  - [x] Create `api/src/services/authService.ts` exporting:
    - `verifyPassword(username: string, password: string): Promise<{ id: number; username: string } | null>` — query `users` by username; `bcrypt.compare()`; return user or null (never distinguish which field was wrong)
  - [x] Uses `bcryptjs.compare()` (same package as setupService)

- [x] Task 2 — `scrubCache` service (AC4)
  - [x] Create `api/src/services/scrubCache.ts` exporting:
    - `deleteAll(userId: number): Promise<void>` — scans Redis for `scrub_cache:{userId}:*` keys and deletes them
  - [x] Key pattern: `scrub_cache:{userId}:{sessionId}` (sessionId derived from JWT `jti` claim in Story 3.x; for now delete by userId prefix)

- [x] Task 3 — Fastify auth plugin (AC3)
  - [x] Create `api/src/plugins/auth.ts` — Fastify plugin that:
    - Registers `fastify.decorate('authenticate', ...)` — a hook that verifies the `token` httpOnly cookie via `fastify.jwt.verify()`
    - On success: decorates `request.user` with `{ id: number; username: string }`
    - On failure (missing/expired/tampered): throws `401 Unauthorized`
  - [x] Register in `api/src/app.ts`

- [x] Task 4 — Auth routes (AC1, AC2, AC4)
  - [x] Create `api/src/routes/auth.ts`:
    - `POST /api/v1/auth/login` — validates body `{ username, password }`; calls `verifyPassword()`; on success: `reply.setCookie('token', jwt, { httpOnly, secure, sameSite: 'strict', path: '/' })`; return 200 `{ message: 'Logged in' }`; on failure: `reply.unauthorized('Invalid credentials')`
    - `POST /api/v1/auth/logout` — requires `preHandler: [fastify.authenticate]`; clears `token` cookie; calls `scrubCache.deleteAll(request.user.id)`; return 200
    - Apply `@fastify/rate-limit` (5 req/min) to the login route only (scoped sub-plugin)
  - [x] Register `authRoute` in `api/src/app.ts`

- [x] Task 5 — Frontend login form (AC1, AC2, AC5)
  - [x] Create `frontend/src/features/auth/LoginForm.tsx`:
    - Controlled form; fields: username, password
    - If `VITE_OIDC_ENABLED=true` env var: hide password form, show SSO button only (stub — Story 1.5 wires OIDC)
    - On submit: `POST /api/v1/auth/login`; on success navigate to `/`; on 401 show "Invalid credentials"; on 429 show "Too many attempts"
  - [x] Create `frontend/src/features/auth/authApi.ts`:
    - `login(username, password): Promise<void>` — POST /api/v1/auth/login
    - `logout(): Promise<void>` — POST /api/v1/auth/logout
    - `getMe(): Promise<{ id: number; username: string }>` — GET /api/v1/auth/me
  - [x] Update `frontend/src/router.tsx`:
    - Replace `/login` placeholder component with `LoginForm`
    - Update `/` `beforeLoad` guard: check both setup status AND JWT validity (call `GET /api/v1/setup` first; if complete, check `GET /api/v1/auth/me` — if 401 → redirect to `/login`)

- [x] Task 6 — `GET /api/v1/auth/me` route (AC3)
  - [x] Add to `api/src/routes/auth.ts`:
    - `GET /api/v1/auth/me` — protected (`preHandler: [fastify.authenticate]`); returns `{ id: number; username: string }`
  - [x] Used by frontend route guard to check JWT validity without full re-auth

- [x] Task 7 — Unit tests (AC1, AC2, AC3, AC4)
  - [x] `api/src/services/authService.test.ts` — 3 tests
  - [x] `api/src/plugins/auth.test.ts` — 3 tests
  - [x] `api/src/routes/auth.test.ts` — 6 tests

- [x] Task 8 — Integration tests (AC1, AC2, AC4)
  - [x] `api/src/routes/auth.integration.test.ts` — 6 tests

- [x] Task 9 — E2E tests (AC1, AC2, AC4, AC5)
  - [x] Updated `e2e/auth.spec.ts` with login/logout scenarios

## Dev Notes

### Files to CREATE (new)

| File | Purpose |
|------|---------|
| `api/src/services/authService.ts` | `verifyPassword()` |
| `api/src/services/authService.test.ts` | Unit tests |
| `api/src/services/scrubCache.ts` | `deleteAll(userId)` Redis cleanup |
| `api/src/plugins/auth.ts` | Fastify JWT auth plugin; decorates `request.user` |
| `api/src/plugins/auth.test.ts` | Unit tests for auth plugin |
| `api/src/routes/auth.ts` | `POST /login`, `POST /logout`, `GET /me` |
| `api/src/routes/auth.test.ts` | Unit tests |
| `api/src/routes/auth.integration.test.ts` | Integration tests |
| `frontend/src/features/auth/LoginForm.tsx` | Login UI component |
| `frontend/src/features/auth/authApi.ts` | `login()`, `logout()`, `me()` fetch wrappers |

### Files to UPDATE (existing)

| File | What changes |
|------|-------------|
| `api/src/app.ts` | Register `authPlugin` (plugins/auth.ts) + `authRoute` |
| `frontend/src/router.tsx` | Replace `/login` placeholder with `LoginForm`; update `/` guard to check JWT |
| `api/vitest.integration.config.ts` | Add `auth.integration.test.ts` to explicit include list |

### Existing files to read before editing

**`api/src/app.ts` current state (Story 1.3 output):**
- Registers: helmet, cors, cookie, jwt, sensible, healthRoute, setupRoute
- `@fastify/jwt` already registered with `secret: env.JWT_SECRET`, cookie name `token`
- Pattern: `await app.register(authPlugin)` then `await app.register(authRoute)`

**`api/src/services/setupService.ts` — bcryptjs import pattern:**
```typescript
import bcrypt from 'bcryptjs'
const ok = await bcrypt.compare(plainPassword, storedHash)
```

**`api/src/services/redisClient.ts` — exports `redis` singleton (ioredis)**

**`frontend/src/router.tsx` current state:**
- `/` route: `beforeLoad` only checks `firstRunComplete` → if false, redirect to `/setup`
- `/login` route: component is placeholder `<div>Login — coming soon</div>`
- Must ADD: if setup is complete AND user not authenticated → redirect to `/login`

**`api/src/db/schema.ts` — `users` table:**
- `id: serial PK`, `username: text unique`, `password_hash: text`, `created_at: timestamp`

### JWT cookie shape

Architecture specifies:
```typescript
reply.setCookie('token', jwtToken, {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',  // false in dev/test
  sameSite: 'strict',
  path: '/',
  maxAge: env.SESSION_TTL_SECONDS,
})
```

JWT payload:
```typescript
{ sub: userId.toString(), username, iat, exp }
```

Sign:
```typescript
const token = app.jwt.sign(
  { sub: String(user.id), username: user.username },
  { expiresIn: env.SESSION_TTL_SECONDS },
)
```

`@fastify/jwt` is already registered in `app.ts` with `secret: env.JWT_SECRET`. Do NOT re-register.

### Auth plugin pattern (plugins/auth.ts)

```typescript
// api/src/plugins/auth.ts
import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    user: { id: number; username: string }
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const payload = await req.jwtVerify<{ sub: string; username: string }>()
        req.user = { id: Number(payload.sub), username: payload.username }
      } catch {
        return reply.unauthorized('Authentication required')
      }
    },
  )
}

export default fp(authPlugin)
```

**Critical:** Use `fastify-plugin` (`fp()`) so `fastify.authenticate` is available in the parent scope (not scoped to a sub-plugin). `@fastify/jwt` registers `req.jwtVerify()` from the cookie named `token` (already configured in app.ts).

Install `fastify-plugin` if not already present:
```bash
cd api && npm install fastify-plugin
```

### auth routes (routes/auth.ts)

```typescript
// POST /api/v1/auth/login
{
  config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  handler: async (req, reply) => {
    const { username, password } = req.body  // Zod validated
    const user = await verifyPassword(username, password)
    if (!user) return reply.unauthorized('Invalid credentials')

    const token = req.server.jwt.sign(
      { sub: String(user.id), username: user.username },
      { expiresIn: env.SESSION_TTL_SECONDS },
    )
    reply.setCookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: env.SESSION_TTL_SECONDS,
    })
    return reply.code(200).send({ message: 'Logged in' })
  }
}

// POST /api/v1/auth/logout — preHandler: [fastify.authenticate]
{
  handler: async (req, reply) => {
    await scrubCache.deleteAll(req.user.id)
    reply.clearCookie('token', { path: '/' })
    return reply.code(200).send({ message: 'Logged out' })
  }
}

// GET /api/v1/auth/me — preHandler: [fastify.authenticate]
{
  handler: async (req, reply) => {
    return reply.send({ id: req.user.id, username: req.user.username })
  }
}
```

### scrubCache.ts — Redis key pattern

```typescript
// api/src/services/scrubCache.ts
// Key scheme: scrub_cache:{userId}:{sessionId}
// deleteAll: uses SCAN + DEL to avoid blocking Redis with KEYS

export async function deleteAll(userId: number): Promise<void> {
  const pattern = `scrub_cache:${userId}:*`
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) await redis.del(...keys)
  } while (cursor !== '0')
}
```

**Do NOT use `redis.keys(pattern)`** — blocks Redis. Always `SCAN` for pattern-based deletes.

### Frontend — LoginForm.tsx

```typescript
// frontend/src/features/auth/LoginForm.tsx
// Fields: username, password
// Reads VITE_OIDC_ENABLED env var at build time:
//   import.meta.env.VITE_OIDC_ENABLED === 'true'
//   If true: hide form, show "Login with SSO" button only (AC5)
// On submit: POST /api/v1/auth/login
// On 200: navigate to '/'
// On 401: show "Invalid credentials"
// On 403/other: show generic error
// Accessibility: label/input association; error has role="alert"
```

`VITE_OIDC_ENABLED` is a build-time env var (Vite exposes `VITE_*` vars via `import.meta.env`). Add to `frontend/.env.local` for dev: `VITE_OIDC_ENABLED=false`.

### Frontend — router.tsx update

```typescript
// Update / route beforeLoad guard to also check auth:
beforeLoad: async () => {
  const { firstRunComplete } = await getSetupStatus()
  if (!firstRunComplete) throw redirect({ to: '/setup' })
  // Setup is complete — check if user is authenticated
  try {
    await getMe()  // GET /api/v1/auth/me
  } catch {
    throw redirect({ to: '/login' })
  }
}
```

Import `getMe` from `authApi.ts`. `getMe()` throws on 401 (apiGet throws on non-OK).

### Rate limiting on login route

`@fastify/rate-limit` is already in `package.json` dependencies. Register globally or per-route:

Per-route config (preferred — narrowly scoped):
```typescript
// In authRoute plugin:
await app.register(rateLimit, {
  max: 5,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
})
```
OR use per-route config object if global rate-limit is already registered. Check `app.ts` — rate-limit is NOT yet registered globally. Register it in `authRoute` plugin scope.

### Unit test patterns

**authService.test.ts — mock db + bcryptjs:**
Same pattern as Story 1.3 `setupService.test.ts`:
```typescript
vi.mock('../db/client.js', () => ({ db: { ... } }))
vi.mock('bcryptjs', () => ({ default: { compare: mockCompare } }))
```
Use `vi.hoisted()` for all mock refs.

**auth.test.ts (route tests) — inject with cookie:**
```typescript
const res = await app.inject({
  method: 'POST',
  url: '/api/v1/auth/login',
  payload: { username: 'admin', password: 'valid' },
})
// Extract cookie from response
const cookie = res.headers['set-cookie']
```

**plugins/auth.test.ts — test via a dummy protected route:**
```typescript
const app = Fastify()
await app.register(jwtPlugin, { secret: 'test-secret-32-chars-minimum-len' })
await app.register(cookiePlugin)
await app.register(sensiblePlugin)
await app.register(authPlugin)
app.get('/protected', { preHandler: [app.authenticate] }, async (req) => req.user)
// Good JWT → 200; bad JWT → 401
```

### Integration test setup

The `beforeAll` in integration tests must create a user via `setupService.createAdminUser()` before testing login. Clean up after with `db.delete(users)`.

For the logout Redis test: insert a dummy `scrub_cache:{userId}:session1` key before logout, verify it's gone after.

Import `runMigrations` to ensure schema is present.

### Previous Story Learnings

**From Story 1.1:**
- `process.env.KEY = undefined` sets string `"undefined"` — always `delete process.env.KEY` in test helpers.

**From Story 1.2:**
- `vi.mock()` factory cannot reference variables declared outside `vi.hoisted()` — always use `vi.hoisted()` for shared mock refs.
- Drizzle `db` mock chain: `select → from → where → limit` — all must return mock objects.
- Integration test file ordering: explicit list in `vitest.integration.config.ts`; add auth to the end.

**From Story 1.3:**
- ESM modules (bcryptjs) cannot be spied on via `vi.spyOn()` — use `vi.mock('bcryptjs', () => ({ default: { ... } }))`.
- drizzle-orm stores migrations in `drizzle.__drizzle_migrations` (schema `drizzle`), not `public`.
- `vi.hoisted()` pattern is mandatory for all `vi.mock` factories that reference external vars.
- `fp()` wrapper (`fastify-plugin`) required for plugins that need to expose decorators across the scope boundary.

### Anti-patterns to avoid

- ❌ Do NOT distinguish username vs password in error responses — always return generic `"Invalid credentials"` (prevents enumeration)
- ❌ Do NOT use `redis.keys(pattern)` for bulk delete — blocks Redis; use `SCAN` + `DEL`
- ❌ Do NOT store JWT in localStorage or sessionStorage — httpOnly cookie only
- ❌ Do NOT use `reply.redirect()` from the login route — return 200 + cookie; let the SPA handle navigation
- ❌ Do NOT register `@fastify/jwt` again in authPlugin — it's already registered in `app.ts`
- ❌ Do NOT use bare `fastify.register()` for authPlugin without `fp()` — decorators won't be visible to routes
- ❌ Do NOT call `scrubCache.deleteAll()` synchronously at import time — it must be called in the logout handler
- ❌ Do NOT add `VITE_OIDC_ENABLED` to the Fastify env schema — it's frontend only; Fastify reads `OIDC_ISSUER_URL` directly

### References

- [Architecture — Authentication & Security](../_bmad-output/planning-artifacts/architecture.md#authentication--security)
- [Architecture — API design (RFC 7807)](../_bmad-output/planning-artifacts/architecture.md#api--communication-patterns)
- [Architecture — scrubCache key scheme](../_bmad-output/planning-artifacts/architecture.md#session-cache--redis-7)
- [Architecture — directory structure (plugins/)](../_bmad-output/planning-artifacts/architecture.md#project-structure)
- [Epics — Story 1.4 ACs + test scenarios](../_bmad-output/planning-artifacts/epics.md#story-14-usernamepassword-login-and-logout)
- [Story 1.3 completion notes (bcryptjs mock, vi.hoisted pattern)](./1-3-first-run-setup-wizard.md)
- [Story 1.2 completion notes (drizzle-orm patterns)](./1-2-database-schema-migration-and-health-check.md)

## Dev Agent Record

### Review Findings

- [x] [Review][Patch] P1 — Dummy bcrypt hash in verifyPassword is malformed — 54 chars after prefix instead of 53; bcryptjs may short-circuit to false without full work-factor computation, breaking timing protection [api/src/services/authService.ts]
- [x] [Review][Patch] P2 — Number(payload.sub) not validated — non-numeric sub yields NaN; req.user.id=NaN propagates silently into deleteAll(NaN) and all downstream handlers [api/src/plugins/auth.ts]
- [x] [Review][Patch] P3 — clearCookie omits httpOnly/sameSite/secure attributes from setCookie — attribute mismatch can prevent cookie clearing in some browsers [api/src/routes/auth.ts — logout]
- [x] [Review][Patch] P4 — AC5 not server-enforced: POST /api/v1/auth/login reachable regardless of OIDC configuration — API bypasses SSO-only intent [api/src/routes/auth.ts]

- [x] [Review][Defer] D1 — JWT not blocklisted on logout — captured token reusable until expiry — deferred, Redis blocklist is architectural addition
- [x] [Review][Defer] D2 — Rate limiting per-IP only — per-username throttle absent — deferred, systemic enhancement
- [x] [Review][Defer] D3 — Logout not CSRF-protected — deferred, story 1.6 CSRF plugin covers POST mutation hooks
- [x] [Review][Defer] D4 — No audit log for login/logout events — deferred, observability enhancement
- [x] [Review][Defer] D5 — No max password length in loginBodySchema — deferred, same bcrypt truncation concern as 1.3 D-level

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
