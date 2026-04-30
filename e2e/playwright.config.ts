import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E test config.
 *
 * Requires full stack running:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
 *   cd frontend && npm run dev  (or serve via nginx)
 *
 * Run:
 *   cd e2e && npx playwright test
 *
 * [Source: story-1.3, task 6]
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
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
