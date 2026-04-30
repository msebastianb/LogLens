/**
 * E2E tests for authentication + first-run setup wizard.
 *
 * Requires full stack:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
 *   cd frontend && npm run dev
 *
 * Reset DB state before running:
 *   docker compose exec postgres psql -U loglens -d loglens -c "DELETE FROM users; DELETE FROM system_settings;"
 *
 * [Source: story-1.3, AC1–AC4; story-1.4, AC1–AC5; story-1.6]
 */
import { test, expect } from '@playwright/test'

// Admin credentials created by the first-run wizard tests.
// The setup test creates these; login tests depend on them.
const ADMIN_USER = 'admin'
const ADMIN_PASSWORD = 'ValidPassword123!'

// ─── Story 1.3 — First-run setup wizard ───────────────────────────────────────

test.describe('first-run setup wizard', () => {
  test.beforeEach(async ({ request }) => {
    const status = await request.get('/api/v1/setup')
    const body = (await status.json()) as { firstRunComplete: boolean }
    if (body.firstRunComplete) {
      test.skip()
    }
  })

  test('AC1: navigating to / on fresh deployment redirects to /setup', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/setup/)
  })

  test('AC2: submitting valid credentials creates admin and redirects to /login', async ({
    page,
  }) => {
    await page.goto('/setup')
    await expect(page).toHaveURL(/\/setup/)

    await page.fill('#username', ADMIN_USER)
    await page.fill('#password', ADMIN_PASSWORD)
    await page.getByRole('button', { name: /create account/i }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })

  test('AC3: navigating to /setup after setup is complete redirects to /login', async ({
    page,
  }) => {
    await page.goto('/setup')
    await expect(page).toHaveURL(/\/login/)
  })

  test('AC4: submitting a short password shows a validation error', async ({ page }) => {
    await page.goto('/setup')

    // If redirected (setup complete), skip
    if (page.url().includes('/login')) {
      test.skip()
      return
    }

    await page.fill('#username', ADMIN_USER)
    await page.fill('#password', 'short')
    await page.getByRole('button', { name: /create account/i }).click()

    const errorEl = page.getByRole('alert')
    await expect(errorEl).toBeVisible()
    await expect(errorEl).toContainText('12')
  })
})

// ─── Story 1.4 — Login / Logout ───────────────────────────────────────────────

test.describe('login page (story-1.4)', () => {
  test('AC1: / redirects to /login when not authenticated (setup complete)', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('AC2: /login shows username and password fields and sign-in button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#username')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('AC3: valid credentials log in and redirect to /', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', ADMIN_USER)
    await page.fill('#password', ADMIN_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/$/, { timeout: 5000 })
  })

  test('AC4: invalid credentials show error message and stay on /login', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', ADMIN_USER)
    await page.fill('#password', 'wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()

    const errorEl = page.getByRole('alert')
    await expect(errorEl).toBeVisible()
    await expect(errorEl).toContainText(/invalid/i)
    await expect(page).toHaveURL(/\/login/)
  })

  test('AC5: logout clears session and redirects to /login', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.fill('#username', ADMIN_USER)
    await page.fill('#password', ADMIN_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 })

    // Click logout
    await page.getByRole('button', { name: /log out/i }).click()

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})

// ─── Story 1.6 — Security headers smoke ─────────────────────────────────────

test.describe('security headers smoke (story-1.6)', () => {
  test('AC1: /health API response includes Content-Security-Policy header', async ({ request }) => {
    const res = await request.get('/health')
    const csp = res.headers()['content-security-policy']
    expect(csp).toBeDefined()
    expect(csp).toContain("default-src 'self'")
  })
})

// ─── Dashboard smoke ─────────────────────────────────────────────────────────

test.describe('dashboard (authenticated)', () => {
  test('shows welcome message and CTA after login', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', ADMIN_USER)
    await page.fill('#password', ADMIN_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 })

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/welcome back/i)
    await expect(page.getByRole('link', { name: /start new analysis/i })).toBeVisible()
  })
})

