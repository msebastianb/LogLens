import { defineConfig } from 'vitest/config'

/**
 * Integration test config — requires real PostgreSQL + Redis + scrubber services.
 *
 * Run with:
 *   docker compose up -d postgres redis scrubber
 *   cd api && npm run test:integration
 *
 * Or from project root:
 *   docker compose run --rm api npm run test:integration
 */
export default defineConfig({
  test: {
    // Default env vars for running integration tests from the host machine.
    // Services must be reachable on these ports (use docker-compose.dev.yml which
    // exposes postgres on host port 5433 and redis:6379 to the host).
    // Override any value by setting the var in your shell before running the suite.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgres://loglens:changeme@localhost:5433/loglens',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_SECRET:
        process.env.JWT_SECRET ??
        'integration-test-secret-minimum-32-characters-long',
      SCRUBBER_URL: 'http://127.0.0.1:8099',
      SCRUBBER_TIMEOUT_MS: '5000',
      NODE_ENV: 'test',
    },
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Explicit file order ensures migrate test runs first (it drops + recreates tables).
    // Subsequent tests rely on tables existing; setup test calls runMigrations() idempotently.
    include: [
      'src/db/migrate.integration.test.ts',
      'src/routes/health.integration.test.ts',
      'src/routes/setup.integration.test.ts',
      'src/routes/auth.integration.test.ts',
      'src/routes/logs.integration.test.ts',
      'src/routes/scrub.integration.test.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
