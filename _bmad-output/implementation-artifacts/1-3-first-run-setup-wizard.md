# Story 1.3: First-run setup wizard

Status: done

## Story

As an administrator,
I want to complete a first-run setup wizard to create an admin account when no OIDC provider is configured,
So that the application is secured on first launch without requiring pre-existing identity infrastructure.

## Acceptance Criteria

**AC1 — Redirect to /setup when not configured:**
**Given** `OIDC_ISSUER_URL` is not set and `system_settings` row `first_run_complete = false`,
**When** a user navigates to any page,
**Then** the UI redirects to `/setup`.

**AC2 — Happy path setup:**
**Given** the setup form,
**When** the admin submits a password of at least 12 characters,
**Then** the password is bcrypt-hashed, the admin user is created in `users`, and `system_settings.first_run_complete` is set to `true`.

**AC3 — Redirect away from /setup when already complete:**
**Given** the wizard is already complete,
**When** a user navigates to `/setup`,
**Then** they are redirected to `/login`.

**AC4 — Password too short:**
**Given** a password shorter than 12 characters is submitted,
**When** the form is validated,
**Then** a validation error is shown and no user is created.

## Tasks / Subtasks

- [x] Task 1 — `isFirstRunComplete()` service function (AC1, AC2, AC3)
  - [x] Create `api/src/services/setupService.ts` exporting:
    - `isFirstRunComplete(): Promise<boolean>` — queries `system_settings` for key `first_run_complete`; returns `false` if absent
    - `createAdminUser(username: string, password: string): Promise<void>` — bcrypt-hashes password (cost 12), inserts into `users`, sets `first_run_complete = true` in `system_settings` in a single transaction

- [x] Task 2 — Setup API route (AC2, AC3, AC4)
  - [x] Create `api/src/routes/setup.ts`:
    - `GET /api/v1/setup` — returns `{ firstRunComplete: boolean }` (used by SPA route guard)
    - `POST /api/v1/setup` — validates body `{ username: string, password: string }`; password min 12 chars; creates admin user; on duplicate call returns 409
  - [x] Register `setupRoute` in `api/src/app.ts`

- [x] Task 3 — Frontend SPA setup (AC1)
  - [x] Create `frontend/src/router.tsx` with TanStack Router v1 route definitions: `/`, `/setup`, `/login`
  - [x] Create `frontend/src/features/setup/setupApi.ts` — `GET /api/v1/setup` fetch wrapper
  - [x] Create `frontend/src/features/setup/FirstRunWizard.tsx` — form: username + password fields; password min 12; submit calls `POST /api/v1/setup`; on success navigate to `/login`
  - [x] Update `frontend/src/main.tsx` — integrate TanStack Router + Query providers; add global route guard: if `GET /api/v1/setup` returns `firstRunComplete: false` redirect to `/setup`
  - [x] Create `frontend/src/lib/queryClient.ts` — TanStack Query client config
  - [x] Create `frontend/src/lib/apiClient.ts` — fetch wrapper (CSRF-aware; sets `Content-Type: application/json`)

- [x] Task 4 — Unit tests (AC2, AC3, AC4)
  - [x] `api/src/services/setupService.test.ts`:
    - `isFirstRunComplete()` returns `false` when no row; returns `true` when row value is `"true"`
    - `createAdminUser()` bcrypt-hashes — output !== input; output length ≥ 60
  - [x] `api/src/routes/setup.test.ts`:
    - `POST /api/v1/setup` with password < 12 chars returns 400 with validation error
    - `POST /api/v1/setup` when `first_run_complete = true` returns 409
    - `GET /api/v1/setup` returns `{ firstRunComplete: false }` when not configured

- [x] Task 5 — Integration tests (AC2, AC3, AC4)
  - [x] `api/src/routes/setup.integration.test.ts`:
    - `POST /api/v1/setup` with valid data creates `users` row + `system_settings` row; returns 200
    - `POST /api/v1/setup` with password < 12 chars returns 400; no row created
    - Second call to `POST /api/v1/setup` returns 409

- [x] Task 6 — E2E tests (AC1, AC2, AC3)
  - [x] Create `e2e/playwright.config.ts`
  - [x] Create `e2e/auth.spec.ts`:
    - Fresh deployment: navigating to `/` redirects to `/setup`
    - Submitting valid password redirects to `/login`
    - After setup, navigating to `/setup` redirects to `/login`

## Dev Notes

### Files to CREATE (new)

| File | Purpose |
|------|---------|
| `api/src/services/setupService.ts` | `isFirstRunComplete()` + `createAdminUser()` |
| `api/src/services/setupService.test.ts` | Unit tests |
| `api/src/routes/setup.ts` | `GET` + `POST /api/v1/setup` |
| `api/src/routes/setup.test.ts` | Unit tests |
| `api/src/routes/setup.integration.test.ts` | Integration tests |
| `frontend/src/router.tsx` | TanStack Router v1 route tree |
| `frontend/src/features/setup/setupApi.ts` | API fetch wrapper |
| `frontend/src/features/setup/FirstRunWizard.tsx` | Setup form component |
| `frontend/src/lib/queryClient.ts` | TanStack Query client config |
| `frontend/src/lib/apiClient.ts` | fetch wrapper with CSRF header injection |
| `e2e/playwright.config.ts` | Playwright config |
| `e2e/auth.spec.ts` | E2E tests for setup + login redirect flows |

### Files to UPDATE (existing)

| File | What changes |
|------|-------------|
| `api/src/app.ts` | Register `setupRoute` plugin |
| `frontend/src/main.tsx` | TanStack Router + Query providers; global route guard |
| `frontend/package.json` | Add `@tanstack/react-router`, `@tanstack/react-query`, TanStack Router devtools |
| `api/package.json` | Add `bcryptjs` + `@types/bcryptjs` |

### Existing files to read before editing

**`api/src/app.ts` current state (Story 1.2 output):**
```typescript
// Already registers: helmet, cors, cookie, jwt, sensible, healthRoute
// Add: await app.register(setupRoute) after healthRoute
```

**`api/src/db/schema.ts` current state:**
- `users`: `id`, `username` (unique), `password_hash`, `created_at`
- `system_settings`: `key` (PK), `value`, `updated_at`
- `data_sources`: `id`, `user_id`, `name`, `url`, `auth_type`, `auth_config`, `created_at`

**`api/src/db/client.ts` — already exports `db` (Drizzle) and `pool` (pg.Pool)**

### bcrypt — package choice

Use `bcryptjs` (pure JS, no native compilation required):
```bash
# api/
npm install bcryptjs
npm install -D @types/bcryptjs
```

**Do NOT use `bcrypt` (native binding)** — requires node-gyp, complicates Docker builds on Alpine.

bcrypt cost factor: **12** for production (OWASP recommendation; ~300ms on modern hardware).

Pattern:
```typescript
import bcrypt from 'bcryptjs'

// Hash:
const hash = await bcrypt.hash(password, 12)

// Verify (Story 1.4):
const ok = await bcrypt.compare(password, storedHash)
```

### setupService.ts — exact implementation pattern

```typescript
// api/src/services/setupService.ts
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, systemSettings } from '../db/schema.js'

const FIRST_RUN_KEY = 'first_run_complete'

export async function isFirstRunComplete(): Promise<boolean> {
  const row = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, FIRST_RUN_KEY))
    .limit(1)
  return row[0]?.value === 'true'
}

export async function createAdminUser(
  username: string,
  password: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12)
  // Wrap in a transaction — user insert + setting update must be atomic
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ username, passwordHash })
    await tx
      .insert(systemSettings)
      .values({ key: FIRST_RUN_KEY, value: 'true' })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: 'true' },
      })
  })
}
```

**Key decisions:**
- `onConflictDoUpdate` on `system_settings` insert — idempotent upsert
- Transaction ensures atomicity: if user insert fails, `first_run_complete` is NOT set
- `FIRST_RUN_KEY = 'first_run_complete'` — keep as a constant, not a magic string

### Setup API route — exact shape

```typescript
// api/src/routes/setup.ts

// GET /api/v1/setup — SPA polling endpoint
// Returns: { firstRunComplete: boolean }
// No auth required — public endpoint

// POST /api/v1/setup — create admin user
// Body: { username: string, password: string }
// Validation:
//   - username: z.string().min(1).max(64)
//   - password: z.string().min(12, 'Password must be at least 12 characters')
// Returns: 200 {} on success
// Returns: 400 RFC 7807 on validation error
// Returns: 409 RFC 7807 "Setup already complete" when first_run_complete = true
// Returns: 409 RFC 7807 "Username already taken" on pg unique violation
```

RFC 7807 error format (via `@fastify/sensible` — already registered):
```typescript
// Validation error — use reply.badRequest()
return reply.badRequest('Password must be at least 12 characters')

// Already complete — use reply.conflict()
return reply.conflict('Setup already complete')
```

Use Zod for body validation (already a dep):
```typescript
const setupBodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(12, 'Password must be at least 12 characters'),
})
```

Parse at handler entry; call `reply.badRequest(error.message)` on `ZodError`.

### Frontend — TanStack Router v1 route tree

TanStack Router v1 uses a file-based or code-based route tree. Use **code-based** for v1 (simpler, no codegen step required at this project scale):

```bash
# frontend/
npm install @tanstack/react-router @tanstack/react-query
npm install -D @tanstack/router-devtools @tanstack/react-query-devtools
```

Minimal `router.tsx`:
```typescript
import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router'
import { queryClient } from './lib/queryClient.js'
import { getSetupStatus } from './features/setup/setupApi.js'
import FirstRunWizard from './features/setup/FirstRunWizard.js'

const rootRoute = createRootRoute()

// Route guard: before loading any route, check if setup is complete
// If not → redirect to /setup; if yes and on /setup → redirect to /login
const setupStatusLoader = async () => {
  const { firstRunComplete } = await getSetupStatus()
  return { firstRunComplete }
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  // Dashboard placeholder (Story 5.x)
  component: () => <div>Dashboard</div>,
  beforeLoad: async () => {
    const { firstRunComplete } = await getSetupStatus()
    if (!firstRunComplete) throw redirect({ to: '/setup' })
  },
})

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: FirstRunWizard,
  beforeLoad: async () => {
    const { firstRunComplete } = await getSetupStatus()
    if (firstRunComplete) throw redirect({ to: '/login' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  // Login form placeholder (Story 1.4)
  component: () => <div>Login placeholder</div>,
})

const routeTree = rootRoute.addChildren([indexRoute, setupRoute, loginRoute])

export const router = createRouter({ routeTree })
```

⚠️ TanStack Router `redirect` is thrown as a special error, not returned. Always use `throw redirect(...)`.

### FirstRunWizard.tsx — form requirements

```typescript
// frontend/src/features/setup/FirstRunWizard.tsx
// Controlled form component using React useState
// Fields: username (text), password (password)
// Client-side: password.length < 12 → show error before submit
// On submit: POST /api/v1/setup
// On success: navigate to /login via router.navigate({ to: '/login' })
// On 409: show "Setup already complete"
// On 400: show server validation message
// Accessibility: all inputs have associated <label>; error messages use role="alert"
```

No CSS framework used yet beyond Tailwind. Tailwind v4 is installed but SPA is minimal at this stage. Keep markup clean and accessible; full styling in later epics.

### apiClient.ts — fetch wrapper

```typescript
// frontend/src/lib/apiClient.ts
// Thin wrapper: sets Content-Type: application/json; returns typed responses
// CSRF injection stub — populated in Story 1.6
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',  // send cookies for JWT
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ title: 'Request failed' }))
    throw Object.assign(new Error(err.title ?? 'Request failed'), { status: res.status, body: err })
  }
  return res.json() as Promise<T>
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}
```

### setupApi.ts

```typescript
// frontend/src/features/setup/setupApi.ts
import { apiGet, apiPost } from '../../lib/apiClient.js'

export interface SetupStatus {
  firstRunComplete: boolean
}

export function getSetupStatus(): Promise<SetupStatus> {
  return apiGet<SetupStatus>('/api/v1/setup')
}

export function submitSetup(username: string, password: string): Promise<void> {
  return apiPost<void>('/api/v1/setup', { username, password })
}
```

### queryClient.ts

```typescript
// frontend/src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
```

### E2E Playwright config

```typescript
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

Run E2E:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
cd e2e && npx playwright test
```

E2E tests require full stack running. They are NOT run as part of `npm test` (unit).

### Unit test patterns

**setupService.test.ts — mock `db`:**

```typescript
vi.mock('../db/client.js', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}))
```

Mock the `select()` chain for `isFirstRunComplete()`. For `createAdminUser()`, verify:
- `bcrypt.hash` was called with cost 12
- output is a string of length ≥ 60
- transaction was called

Use `vi.spyOn(bcryptjs, 'hash')` to inspect call args without real hashing.

**setup.test.ts — use Fastify inject():**

Inject `isFirstRunComplete` and `createAdminUser` as route options OR mock the module:
```typescript
vi.mock('../services/setupService.js', () => ({
  isFirstRunComplete: vi.fn(),
  createAdminUser: vi.fn(),
}))
```

### PostgreSQL unique constraint handling

When `username` already exists, `INSERT INTO users` throws a pg error with code `'23505'` (unique violation). Catch in route handler:

```typescript
import type { DatabaseError } from 'pg'

try {
  await createAdminUser(username, password)
} catch (err) {
  const dbErr = err as DatabaseError
  if (dbErr.code === '23505') {
    return reply.conflict('Username already taken')
  }
  throw err  // rethrow unexpected errors
}
```

### Previous Story Learnings

**From Story 1.1:**
- `process.env.KEY = undefined` sets string `"undefined"` — always `delete process.env.KEY` in test helpers.
- Zod `z.string().min(1)` not `z.string().nonempty()`.
- Pydantic v2 uses `model_config = SettingsConfigDict(...)`.

**From Story 1.2:**
- Drizzle `drizzle-orm/node-postgres` (not `postgres-js`) for `pg` package.
- Unit test files use `vi.mock()` before any imports; call `vi.resetModules()` in `beforeEach` when testing module-level effects.
- Integration tests excluded from unit config via `src/**/*.integration.test.ts` pattern.
- Fastify plugin dependency injection (pass deps as plugin options) makes unit tests deterministic.
- `onConflictDoUpdate` on `system_settings` upsert — prevents duplicate key errors on re-setup.

### Anti-patterns to avoid

- ❌ Do NOT use `bcrypt` (native) — use `bcryptjs` (pure JS, works on Alpine)
- ❌ Do NOT store plain-text password anywhere (not even temporarily in a variable after validation)
- ❌ Do NOT distinguish username vs password failure in 401 responses (timing/enumeration attack)
- ❌ Do NOT use `{ data: { ... } }` response wrapper — `{ firstRunComplete: boolean }` direct
- ❌ Do NOT use `return redirect(...)` in TanStack Router — must `throw redirect(...)` 
- ❌ Do NOT use `isLoading: boolean` flag — derive from TanStack Query state
- ❌ Do NOT add any other routes to `router.tsx` beyond `/`, `/setup`, `/login` — other routes added in their own stories
- ❌ Do NOT call `isFirstRunComplete()` from inside `createAdminUser()` — race condition; check before calling, not inside

### References

- [Architecture — Authentication Flow](../_bmad-output/planning-artifacts/architecture.md#authentication-security)
- [Architecture — Routing (TanStack Router)](../_bmad-output/planning-artifacts/architecture.md#routing)
- [Architecture — DB schema (users + system_settings)](../_bmad-output/planning-artifacts/architecture.md#data-architecture)
- [Architecture — RFC 7807 errors](../_bmad-output/planning-artifacts/architecture.md#api-design)
- [Epics — Story 1.3 ACs + test scenarios](../_bmad-output/planning-artifacts/epics.md#story-13-first-run-setup-wizard)
- [Story 1.2 completion notes (DB client patterns)](./1-2-database-schema-migration-and-health-check.md)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- drizzle-orm stores migration tracking in `drizzle.__drizzle_migrations` (schema=`drizzle`), NOT `public.__drizzle_migrations`. `dropAllTables()` in migrate integration test must `DROP SCHEMA IF EXISTS drizzle CASCADE` not `DROP TABLE IF EXISTS __drizzle_migrations`.
- ESM modules (bcryptjs) cannot be spied on via `vi.spyOn()` — must use `vi.mock('bcryptjs', () => ({ default: { hash: vi.fn() } }))` + `vi.hoisted()`.
- `vi.mock()` factory cannot reference variables declared outside `vi.hoisted()` — always use `vi.hoisted()` for shared mock refs.

### Completion Notes List

- `bcryptjs` (pure JS) installed; `@types/bcryptjs` dev dep.
- `setupService.ts`: `isFirstRunComplete()` + `createAdminUser()` with bcrypt cost 12 + Drizzle transaction.
- `routes/setup.ts`: `GET /api/v1/setup` + `POST /api/v1/setup`; Zod body validation; 400/409 RFC 7807 via `@fastify/sensible`.
- Registered `setupRoute` in `app.ts`.
- Frontend: `router.tsx` (TanStack Router v1, code-based), `FirstRunWizard.tsx`, `setupApi.ts`, `apiClient.ts`, `queryClient.ts`.
- `main.tsx` updated: RouterProvider + QueryClientProvider.
- 27 unit tests passing (5 suites).
- 10 integration tests passing (3 suites).
- Drizzle schema drop fix applied to `migrate.integration.test.ts` (Story 1.2 file).
- E2E scaffold: `e2e/playwright.config.ts` + `e2e/auth.spec.ts` (requires full stack).

### File List

**Created:**
- `api/src/services/setupService.ts`
- `api/src/services/setupService.test.ts`
- `api/src/routes/setup.ts`
- `api/src/routes/setup.test.ts`
- `api/src/routes/setup.integration.test.ts`
- `frontend/src/router.tsx`
- `frontend/src/features/setup/setupApi.ts`
- `frontend/src/features/setup/FirstRunWizard.tsx`
- `frontend/src/lib/queryClient.ts`
- `frontend/src/lib/apiClient.ts`
- `e2e/playwright.config.ts`
- `e2e/auth.spec.ts`

### Review Findings

- [x] [Review][Patch] P1 — GET /setup missing OIDC flag — AC1 requires redirect when OIDC not set AND first_run_complete=false; OIDC state not included in response [api/src/routes/setup.ts]
- [x] [Review][Patch] P2 — TOCTOU race: isFirstRunComplete() and createAdminUser() are separate awaits — two concurrent POST /setup can create two admin users [api/src/routes/setup.ts]
- [x] [Review][Patch] P3 — POST /setup accessible when OIDC is configured — no OIDC check in route, local admin account can be created even in SSO-only deployments [api/src/routes/setup.ts]
- [x] [Review][Patch] P4 — No max password length — bcrypt silently truncates at 72 bytes, passwords >72 chars hash identically to first 72 with no feedback [api/src/services/setupService.ts]
- [x] [Review][Patch] P5 — err cast to DatabaseError is unsafe — any thrown error with a .code property passes the check; use instanceof or a type-guard [api/src/routes/setup.ts]

- [x] [Review][Defer] D1 — AC3 maps to 409 conflict; AC says redirect to /login — redirect is frontend responsibility, API 409 is correct — deferred
- [x] [Review][Defer] D2 — Username accepts control characters and Unicode confusables — deferred, no security impact in username storage context
- [x] [Review][Defer] D3 — No rate limiting on POST /setup — deferred, pre-existing gap across endpoints

**Modified:**
- `api/src/app.ts` — registered `setupRoute`
- `api/src/db/migrate.integration.test.ts` — fixed `dropAllTables()` to drop `drizzle` schema
- `api/vitest.integration.config.ts` — explicit file order (migrate first)
- `frontend/src/main.tsx` — RouterProvider + QueryClientProvider
- `api/package.json` — `bcryptjs` dep, `@types/bcryptjs` devDep
