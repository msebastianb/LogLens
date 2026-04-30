# Story 1.2: Database schema migration and health check

Status: done

## Story

As a system administrator,
I want the database schema to be applied automatically on first start and the health endpoint to confirm all dependencies are reachable,
So that I don't run manual migration steps and Kubernetes knows when the pod is ready.

## Acceptance Criteria

**AC1 — Migration on startup (happy path):**
**Given** `DATABASE_URL` is set and the `postgres` service is reachable,
**When** the `api` container starts,
**Then** Drizzle runs pending migrations and creates `users`, `system_settings`, and `data_sources` tables if absent.

**AC2 — Migration failure:**
**Given** a migration failure (e.g. PostgreSQL unreachable),
**When** the container starts,
**Then** Fastify logs the error and `GET /health` returns 503.

**AC3 — Full health check (all ok):**
**Given** all dependencies (`postgres`, `redis`, `scrubber`) are reachable,
**When** `GET /health` is called,
**Then** response is 200 JSON `{ "status": "ok", "checks": { "db": "ok", "cache": "ok", "scrubber": "ok" } }`.

**AC4 — Health check partial failure:**
**Given** any one dependency is unreachable,
**When** `GET /health` is called,
**Then** response is 503 JSON with the failing dependency identified by name, e.g. `{ "status": "degraded", "checks": { "db": "error", "cache": "ok", "scrubber": "ok" } }`.

## Tasks / Subtasks

- [x] Task 1 — Drizzle schema + DB client (AC1)
  - [x] Create `api/src/db/schema.ts` with three table definitions: `users`, `system_settings`, `data_sources`
  - [x] Create `api/src/db/client.ts` with `pg.Pool` + `drizzle()` singleton; export `db`
  - [x] Create `api/drizzle.config.ts` for `drizzle-kit generate` CLI

- [x] Task 2 — Generate migrations (AC1)
  - [x] Run `npm run db:generate` to produce SQL migration files in `api/src/db/migrations/`
  - [x] Commit generated migration files (they are source-controlled artifacts)

- [x] Task 3 — runMigrations startup hook (AC1, AC2)
  - [x] Create `api/src/db/migrate.ts` exporting `runMigrations()` — calls `migrate()` from `drizzle-orm/node-postgres/migrator`
  - [x] Update `api/src/main.ts`: call `runMigrations()` before `app.listen()`; on failure log error and `process.exit(1)`

- [x] Task 4 — Redis client singleton (needed by health check + later stories)
  - [x] Create `api/src/services/redisClient.ts` — creates and exports `redis: Redis` ioredis singleton

- [x] Task 5 — Full health check route (AC3, AC4)
  - [x] Replace stub in `api/src/routes/health.ts` with full implementation
  - [x] DB check: `db.execute(sql\`SELECT 1\`)` with 2-second timeout
  - [x] Cache check: `redis.ping()` with 2-second timeout
  - [x] Scrubber check: `fetch('http://scrubber:8001/health', { signal: AbortSignal.timeout(2000) })`
  - [x] Respond 200 if all ok; 503 if any fail; include per-check status in `checks` object

- [x] Task 6 — Unit tests (AC2, AC3, AC4)
  - [x] `api/src/db/migrate.test.ts`: mock `migrate()` — verify `runMigrations()` calls it once; verify rejection causes `process.exit(1)` in main startup
  - [x] `api/src/routes/health.test.ts`: mock all three check dependencies; verify 200+ok when all pass; verify 503+degraded when each fails individually

- [x] Task 7 — Integration tests (AC1, AC3, AC4)
  - [x] `api/src/db/migrate.integration.test.ts`: against real PostgreSQL; verify tables created; verify idempotent re-run
  - [x] `api/src/routes/health.integration.test.ts`: against real services; verify 200; verify 503 when db connection string points to non-existent host

## Dev Notes

### Files to CREATE (new)

| File | Purpose |
|------|---------|
| `api/src/db/schema.ts` | Drizzle table definitions for all three tables |
| `api/src/db/client.ts` | pg Pool + Drizzle instance singleton |
| `api/src/db/migrate.ts` | `runMigrations()` exported function |
| `api/src/db/migrations/` | Directory; populated by `npm run db:generate` |
| `api/src/services/redisClient.ts` | ioredis singleton for health + later stories |
| `api/drizzle.config.ts` | drizzle-kit CLI config |
| `api/src/db/migrate.test.ts` | Unit tests for migrations module |
| `api/src/routes/health.test.ts` | Unit tests for health route handler |
| `api/src/db/migrate.integration.test.ts` | Integration tests for DB migrations |
| `api/src/routes/health.integration.test.ts` | Integration tests for full health endpoint |

### Files to UPDATE (existing — read before editing)

| File | What changes |
|------|-------------|
| `api/src/routes/health.ts` | Replace stub with real db/redis/scrubber checks |
| `api/src/main.ts` | Add `runMigrations()` call before `app.listen()` |
| `api/package.json` | Add `db:generate` and `db:migrate` scripts |
| `api/vitest.config.ts` | Add integration test glob; add `INTEGRATION` env var guard |

### Exact file content being replaced

**`api/src/routes/health.ts` current state (stub, Story 1.1):**
```typescript
export async function healthRoute(app: FastifyInstance) {
  app.get('/health', async (_request, _reply) => {
    return { status: 'ok' }
  })
}
```
This stub must be **replaced** with the real implementation. The route already registered in `app.ts` — do NOT re-register it.

**`api/src/main.ts` current state:**
```typescript
async function start() {
  const app = await buildApp()
  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`LogLens API listening on ${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
```
Add `await runMigrations()` before `await app.listen(...)`. Wrap migrations in its own try/catch — a migration failure must call `process.exit(1)` separately from the listen failure.

### Drizzle ORM — exact versions and imports

Package versions (from `api/package.json`):
- `drizzle-orm`: `^0.39.0`
- `drizzle-kit`: `^0.30.0`
- `pg`: `^8.13.0`

Adapter for `pg` npm package (not `postgres` or `postgres-js`):
```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
```

**⚠️ Do NOT use `drizzle-orm/postgres-js`** — that adapter is for the `postgres` npm package (Slonik/postgres.js). We use `pg` (node-postgres).

### drizzle.config.ts (drizzle-kit 0.30.x syntax)

In drizzle-kit 0.30.x, use `dialect: 'postgresql'` (NOT the old `driver: 'pg'`):

```typescript
// api/drizzle.config.ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

Add to `api/package.json` scripts:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

### Drizzle schema — exact table definitions

Follow architecture naming conventions: `snake_case` columns, `plural` table names.

```typescript
// api/src/db/schema.ts
import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const dataSources = pgTable('data_sources', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  authType: text('auth_type').notNull().default('none'),
  authConfig: text('auth_config'),  // encrypted JSON; populated Story 2.x
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

**Naming check:**
- Table names: `users`, `system_settings`, `data_sources` ✅ `snake_case` plural
- Column names: `password_hash`, `user_id`, `created_at`, `auth_type`, `auth_config` ✅ `snake_case`
- TypeScript field names: `passwordHash`, `userId`, `createdAt`, `authType`, `authConfig` ✅ `camelCase` (Drizzle maps automatically)

### DB client — pg Pool

```typescript
// api/src/db/client.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../config/env.js'
import * as schema from './schema.js'

// Single pool instance — reused across all requests
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,           // match default pg pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

export const db = drizzle(pool, { schema })
// Export pool for health check raw ping
export { pool }
```

### runMigrations — startup migration

```typescript
// api/src/db/migrate.ts
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from './client.js'

export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: new URL('../../../src/db/migrations', import.meta.url).pathname,
  })
}
```

⚠️ The `migrationsFolder` path must resolve correctly inside the compiled Docker container. Since `outDir` is `dist/` and migrations are copied by Dockerfile, use `import.meta.url`-relative resolution or ensure migrations folder is copied into the image.

**Simpler approach for Node ESM + Docker:** Pass an absolute path using `fileURLToPath` + `import.meta.url`:
```typescript
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Resolves to src/db/migrations/ at runtime (both dev tsx and compiled dist/)
export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: join(__dirname, 'migrations'),
  })
}
```

**Updated `api/src/main.ts`:**
```typescript
import { buildApp } from './app.js'
import { runMigrations } from './db/migrate.js'

const PORT = 3000
const HOST = '0.0.0.0'

async function start() {
  // Run migrations before accepting traffic
  try {
    await runMigrations()
  } catch (err) {
    console.error('[startup] Migration failed:', err)
    process.exit(1)
  }

  const app = await buildApp()

  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`LogLens API listening on ${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
```
Note: `runMigrations()` runs before `buildApp()` since we need to `console.error` (logger not yet available).

### Redis client singleton

```typescript
// api/src/services/redisClient.ts
import Redis from 'ioredis'
import { env } from '../config/env.js'

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  enableReadyCheck: true,
  maxRetriesPerRequest: 1,  // fail fast for health checks
  connectTimeout: 2000,
})
```

`lazyConnect: true` — connection established on first command, not at module import. Prevents startup crash when Redis temporarily unavailable during init.

### Health check route — full implementation

Response shape (matches AC3/AC4 exactly):
```typescript
type CheckStatus = 'ok' | 'error'
interface HealthResponse {
  status: 'ok' | 'degraded'
  checks: {
    db: CheckStatus
    cache: CheckStatus
    scrubber: CheckStatus
  }
}
```

DB check: use raw pool `SELECT 1` (avoids Drizzle overhead; direct connectivity test):
```typescript
await pool.query('SELECT 1')
```

Cache check:
```typescript
await redis.ping()
```

Scrubber check:
```typescript
const res = await fetch('http://scrubber:8001/health', {
  signal: AbortSignal.timeout(2000),
})
if (!res.ok) throw new Error(`scrubber HTTP ${res.status}`)
```

Each check wrapped in independent try/catch so one failure doesn't prevent others from running.

HTTP status: `reply.code(checks.includes('error') ? 503 : 200)`

### Vitest — unit vs integration test split

Add to `api/vitest.config.ts`:
```typescript
// Unit tests: always run
include: ['src/**/*.test.ts'],
// Integration: run only with INTEGRATION=true
// Add a separate vitest.integration.config.ts that includes *.integration.test.ts
```

Create `api/vitest.integration.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30000,  // DB + network ops need more time
  },
})
```

Update `api/package.json` scripts:
```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

Integration tests require real services. Run with:
```bash
# From project root (services must be running)
docker compose up -d postgres redis scrubber
cd api && npm run test:integration
```

### Unit test patterns

**Migration unit test (`api/src/db/migrate.test.ts`):**
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('drizzle-orm/node-postgres/migrator', () => ({
  migrate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./client.js', () => ({ db: {} }))

describe('runMigrations', () => {
  it('calls migrate() once', async () => {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    const { runMigrations } = await import('./migrate.js')
    await runMigrations()
    expect(migrate).toHaveBeenCalledOnce()
  })
})
```

**Health route unit test (`api/src/routes/health.test.ts`):**

Use `fastify.inject()` for route testing — no real network needed.

Key scenarios:
1. All checks pass → 200, `{ status: 'ok', checks: { db: 'ok', cache: 'ok', scrubber: 'ok' } }`
2. DB check fails → 503, `{ status: 'degraded', checks: { db: 'error', cache: 'ok', scrubber: 'ok' } }`
3. Cache check fails → 503, `{ status: 'degraded', checks: { db: 'ok', cache: 'error', scrubber: 'ok' } }`
4. Scrubber check fails → 503, `{ status: 'degraded', ..., scrubber: 'error' }`

Mock injection pattern — pass mocked `pool`, `redis`, `scrubberUrl` as options into `healthRoute()`:
```typescript
// health.ts — accept dependencies via options for testability
export async function healthRoute(
  app: FastifyInstance,
  opts: { pool: Pool; redis: Redis; scrubberUrl: string }
) { ... }

// app.ts — call with real instances:
await app.register(healthRoute, {
  pool, redis, scrubberUrl: 'http://scrubber:8001'
})
```

This avoids global module mocking and makes tests deterministic.

### Drizzle migrations directory — Docker Dockerfile update

`api/Dockerfile` currently compiles TypeScript to `dist/`. Migration SQL files in `src/db/migrations/` are not TypeScript — they won't be compiled. Must be **explicitly copied** in the Dockerfile build stage.

Current `api/Dockerfile` (from Story 1.1):
```dockerfile
# Copy compiled output
COPY --from=builder /app/dist ./dist
```

Must add:
```dockerfile
# Copy migration files (not compiled by tsc)
COPY --from=builder /app/src/db/migrations ./src/db/migrations
```

OR restructure so migrations folder copies to `dist/db/migrations/` and update `migrate.ts` path accordingly.

**Recommended approach:** Copy migrations alongside dist so the path resolution in `migrate.ts` using `import.meta.url` points to `dist/db/migrations/`. Update Dockerfile to:
```dockerfile
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/migrations ./dist/db/migrations
```

And `migrate.ts` path:
```typescript
// Resolves to dist/db/migrations/ in container, src/db/migrations/ in dev (tsx runs from src/)
const migrationsFolder = join(__dirname, 'migrations')
```

`tsx watch` runs from `src/` so `__dirname` = `src/db/` → `src/db/migrations/` ✅
Compiled Node runs from `dist/db/` → `dist/db/migrations/` ✅ (after Dockerfile copies them there)

### Previous Story Learnings (Story 1.1)

- **`process.env` coercion:** Setting `process.env.KEY = undefined` sets it to string `"undefined"`. Always `delete process.env.KEY` explicitly in test helpers. Applies to Vitest env manipulation in this story too.
- **Zod `z.string().min(1)`** not `z.string().nonempty()` — `nonempty()` deprecated in Zod v3.
- **Vitest `vi.resetModules()`** before dynamic import when testing module-level side effects (e.g. Pydantic/Zod validation, DB client initialization).
- **Pydantic v2** uses `model_config = SettingsConfigDict(...)` not class-based `class Config`. Doesn't apply to TypeScript story but noted for any Python changes.

### Anti-patterns to avoid

- ❌ Do NOT hand-write SQL in migration files — always use `drizzle-kit generate` from schema changes
- ❌ Do NOT use `drizzle-orm/postgres-js` — we use `pg` (node-postgres), so use `drizzle-orm/node-postgres`
- ❌ Do NOT add `ports:` to the `scrubber` service (already established, must remain zero ports)
- ❌ Do NOT return `{ data: { ... } }` wrapper — health response is direct: `{ status, checks }`
- ❌ Do NOT use a single `try/catch` around all three health checks — they must run independently so partial failures are reported accurately
- ❌ Do NOT hardcode `http://scrubber:8001` in health route — pass as constructor option for testability
- ❌ Do NOT write log content to DB (no log storage in PostgreSQL per architecture)
- ❌ Do NOT expose `pool` or `redis` as module-level singletons imported directly in route handlers — inject via Fastify plugin options for testability

### References

- [Architecture — DB + Drizzle ORM decisions](../_bmad-output/planning-artifacts/architecture.md)
- [Architecture — Health Checks FR34](../_bmad-output/planning-artifacts/architecture.md#health-checks-fr34)
- [Architecture — Data Architecture (table schemas)](../_bmad-output/planning-artifacts/architecture.md#data-architecture)
- [Epics — Story 1.2 ACs + test scenarios](../_bmad-output/planning-artifacts/epics.md#story-12-database-schema-migration-and-health-check)
- [Story 1.1 completion notes](./1-1-docker-compose-stack-with-per-service-env-validation.md)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

- All 7 tasks complete. 10 new files created; 4 existing files updated.
- Vitest unit: 15/15 pass (`health.test.ts` 5, `migrate.test.ts` 3, `env.test.ts` 7`).
- Integration tests created but require real services (`docker compose up -d postgres redis scrubber`) — excluded from unit config via `src/**/*.integration.test.ts` exclude pattern. Run with `npm run test:integration`.
- `drizzle-orm/node-postgres` adapter used (not `postgres-js`) — correct for `pg` package.
- drizzle-kit 0.30.x uses `dialect: 'postgresql'` in config (not `driver: 'pg'`).
- Migration SQL files copied into Docker image via explicit Dockerfile `COPY` — `tsc` does not compile `.sql` files. Placed at `dist/db/migrations/` to match `import.meta.url`-relative `__dirname` resolution from compiled `dist/db/migrate.js`.
- Health route uses dependency injection (`HealthRouteOptions`) — `pool`, `redis`, `scrubberUrl` passed as Fastify plugin options. Makes unit tests deterministic without global module mocking.
- All three health checks run concurrently via `Promise.all()` — no short-circuit on first failure.
- `vitest.config.ts` updated to exclude `*.integration.test.ts` from unit run.
- `api/package.json` scripts added: `db:generate`, `db:migrate`, `db:studio`, `test:integration`.

### File List

- `api/src/db/schema.ts` *(new)*
- `api/src/db/client.ts` *(new)*
- `api/src/db/migrate.ts` *(new)*
- `api/src/db/migrate.test.ts` *(new)*
- `api/src/db/migrate.integration.test.ts` *(new)*
- `api/src/db/migrations/0000_greedy_ogun.sql` *(new — generated)*
- `api/src/services/redisClient.ts` *(new)*
- `api/src/routes/health.ts` *(updated — stub replaced with full implementation)*
- `api/src/routes/health.test.ts` *(new)*
- `api/src/routes/health.integration.test.ts` *(new)*
- `api/drizzle.config.ts` *(new)*
- `api/vitest.config.ts` *(updated — exclude integration tests)*
- `api/vitest.integration.config.ts` *(new)*
- `api/src/main.ts` *(updated — runMigrations() before app.listen())*
- `api/src/app.ts` *(updated — pass pool/redis/scrubberUrl to healthRoute)*
- `api/package.json` *(updated — db:generate, db:migrate, db:studio, test:integration scripts)*
- `api/Dockerfile` *(updated — COPY migration SQL files to dist/db/migrations/)*

### Review Findings

- [x] [Review][Patch] P1 — checkDb has no query execution timeout — pool.query('SELECT 1') can stall indefinitely on a hung Postgres; spec requires 2-second timeout [api/src/routes/health.ts — checkDb]
- [x] [Review][Patch] P2 — pool.query() used instead of spec-required db.execute() with 2-second timeout — task 5 explicitly specifies Drizzle db.execute() [api/src/routes/health.ts — checkDb]
- [x] [Review][Patch] P3 — redisClient lazyConnect defers connection — malformed REDIS_URL not caught at startup, only fails on first command [api/src/services/redisClient.ts]

- [x] [Review][Defer] D1 — AC2 violation: migration failure causes process.exit(1) before health endpoint exists — process exits before port opens, callers get ECONNREFUSED not 503 — deferred, architectural constraint
- [x] [Review][Defer] D2 — system_settings.updatedAt never auto-updates on UPDATE — no trigger, Drizzle-level defaultNow() fires only on INSERT — deferred, needs DB migration to fix
- [x] [Review][Defer] D3 — data_sources.authConfig stores credentials as unencrypted plaintext — deferred, encryption planned Story 2.x per dev notes
- [x] [Review][Defer] D4 — data_sources.url can embed credentials in connection string — deferred, same as D3
- [x] [Review][Defer] D5 — No SIGTERM/SIGINT graceful shutdown for pool or redis — deferred, pre-existing cross-cutting concern
- [x] [Review][Defer] D6 — health.integration.test.ts imports buildApp at module scope creating dangling connections — deferred, test quality not production issue
