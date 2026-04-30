/**
 * E2E tests for the analysis pipeline: file upload, scrub review,
 * LLM analysis, structured output, cancellation, and non-blocking UI.
 *
 * Requires full stack running and an authenticated session.
 * Fixture files are read from e2e/fixtures/.
 *
 * [Source: story-2.4, AC1, AC4, AC5]
 * [Source: story-4.3 AC1–AC5; story-4.4 AC1–AC5; story-4.5 AC1–AC4]
 * [Source: story-5.1 AC1–AC6; story-5.2 AC1–AC5; story-5.3 AC1–AC2]
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

// Analysis tests involve real LLM calls and may need extra navigation time
// when the Vite dev server is under load.
test.setTimeout(60000)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ADMIN_USER = 'admin'
const ADMIN_PASSWORD = 'ValidPassword123!'

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Login and navigate to /analysis. */
async function loginAndGoToAnalysis(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.fill('#username', ADMIN_USER)
  await page.fill('#password', ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/$/, { timeout: 15000 })
  await page.goto('/analysis', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForURL(/\/analysis/)
}

/** Upload a fixture file and wait for the redaction review panel. */
async function uploadLogFixture(page: Page, fixture = 'sample.log') {
  await loginAndGoToAnalysis(page)
  const fixturePath = path.join(__dirname, 'fixtures', fixture)

  // Set file on the hidden input directly (sr-only input)
  await page.locator('#log-file').setInputFiles(fixturePath)

  // Click "Analyze logs" submit button and wait for upload response
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/v1/logs/upload') && res.status() === 200,
    ),
    page.getByRole('button', { name: /analyze logs/i }).click(),
  ])

  // After upload, AnalysisView transitions to awaiting-review
  await expect(
    page.getByRole('button', { name: /confirm and analyze/i }),
  ).toBeVisible({ timeout: 10000 })
}

/** Upload and confirm review to start LLM analysis. */
async function startAnalysis(page: Page, fixture = 'sample.log') {
  await uploadLogFixture(page, fixture)
  await page.getByRole('button', { name: /confirm and analyze/i }).click()
}

// ─── Story 2.4 — Log file upload ─────────────────────────────────────────────

test.describe('Log file upload (story-2.4)', () => {
  test('AC5: /analysis renders "Analyze Logs" heading with Upload File tab active', async ({
    page,
  }) => {
    await loginAndGoToAnalysis(page)
    await expect(page.getByRole('heading', { name: /analyze logs/i })).toBeVisible()
    // Upload File tab is selected
    await expect(
      page.getByRole('tab', { name: /upload file/i, selected: true }),
    ).toBeVisible()
    // Loki Query tab is disabled (Post-MVP)
    await expect(page.getByRole('tab', { name: /loki query/i })).toBeDisabled()
  })

  test('AC1: uploading a .log file triggers /api/v1/logs/upload and shows review panel', async ({
    page,
  }) => {
    await loginAndGoToAnalysis(page)

    const sampleLog = path.join(__dirname, 'fixtures', 'sample.log')
    await page.locator('#log-file').setInputFiles(sampleLog)

    const [uploadResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/v1/logs/upload') && res.status() === 200,
      ),
      page.getByRole('button', { name: /analyze logs/i }).click(),
    ])

    expect(uploadResponse.status()).toBe(200)
    await expect(
      page.getByRole('button', { name: /confirm and analyze/i }),
    ).toBeVisible({ timeout: 10000 })
  })

  test('AC1: uploading a .ndjson file works end-to-end', async ({ page }) => {
    await loginAndGoToAnalysis(page)

    const sampleNdjson = path.join(__dirname, 'fixtures', 'sample.ndjson')
    await page.locator('#log-file').setInputFiles(sampleNdjson)

    const [uploadResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/v1/logs/upload') && res.status() === 200,
      ),
      page.getByRole('button', { name: /analyze logs/i }).click(),
    ])

    expect(uploadResponse.status()).toBe(200)
    await expect(
      page.getByRole('button', { name: /confirm and analyze/i }),
    ).toBeVisible({ timeout: 10000 })
  })

  test('AC4: selecting a .csv file shows client-side rejection without network request', async ({
    page,
  }) => {
    await loginAndGoToAnalysis(page)

    let uploadCalled = false
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/logs/upload')) uploadCalled = true
    })

    // Use setInputFiles with a .csv to trigger the onChange handler.
    // The component's processFile checks extension and rejects non-allowed types.
    await page.locator('#log-file').setInputFiles({
      name: 'data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('a,b,c'),
    })

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(/unsupported file type/i)
    expect(uploadCalled).toBe(false)
  })
})

// ─── Story 3.1 — Redaction review panel ──────────────────────────────────────

test.describe('Redaction review panel (story-3.1)', () => {
  test('review panel shows heading and confirm/cancel buttons after upload', async ({ page }) => {
    await uploadLogFixture(page)

    await expect(page.getByRole('heading', { name: /review before analysis/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /confirm and analyze/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel and start over/i })).toBeVisible()
  })

  test('cancel button returns to idle state with upload form', async ({ page }) => {
    await uploadLogFixture(page)

    await page.getByRole('button', { name: /cancel and start over/i }).click()

    // Should be back to idle with the file upload heading
    await expect(page.getByRole('heading', { name: /analyze logs/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /upload file/i })).toBeVisible()
  })
})

// ─── Story 4.3 + 5.1 — Analysis pipeline + progress indicators ───────────────

test.describe('Analysis pipeline — full journey (story-4.3, story-5.1)', () => {
  test('pipeline transitions through stages and shows structured output on complete', async ({
    page,
  }) => {
    await uploadLogFixture(page)

    // Confirm review — triggers LLM analysis
    await page.getByRole('button', { name: /confirm and analyze/i }).click()

    // Progress indicator should show analysing stage
    await expect(page.getByTestId('stage-analysing')).toBeVisible({ timeout: 10000 })

    // Wait for complete stage indicator (generous timeout for real LLM call)
    await expect(page.getByTestId('stage-complete')).toBeVisible({ timeout: 120000 })

    // Structured output should be visible
    await expect(page.getByTestId('analysis-output')).toBeVisible()

    // "Start new analysis" button should appear
    await expect(
      page.getByRole('button', { name: /start new analysis/i }),
    ).toBeVisible()
  })

  test('story-5.1 AC2: progress stages appear after clicking Analyze logs', async ({ page }) => {
    await loginAndGoToAnalysis(page)
    const fixturePath = path.join(__dirname, 'fixtures', 'sample.log')
    await page.locator('#log-file').setInputFiles(fixturePath)

    // Click submit
    await page.getByRole('button', { name: /analyze logs/i }).click()

    // At least one progress stage visible within 5s
    await expect(
      page.getByTestId('stage-fetching').or(page.getByTestId('stage-scrubbing')).first(),
    ).toBeVisible({ timeout: 5000 })
  })
})

// ─── Story 4.4 — Structured output sections ──────────────────────────────────

test.describe('Structured analysis output (story-4.4)', () => {
  test('all five output sections visible after analysis completes', async ({ page }) => {
    await startAnalysis(page)

    // Wait for analysis to complete (generous timeout for real LLM)
    await expect(page.locator('#errors-heading')).toBeVisible({ timeout: 120000 })
    await expect(page.locator('#anomalies-heading')).toBeVisible()
    await expect(page.locator('#rootcause-heading')).toBeVisible()
    await expect(page.locator('#timeline-heading')).toBeVisible()
    await expect(page.locator('#nextsteps-heading')).toBeVisible()
  })

  test('AC5: AI-generated disclaimer visible on analysis output', async ({ page }) => {
    await startAnalysis(page)

    const disclaimer = page.locator('[role="alert"][aria-label="AI-generated disclaimer"]')
    await expect(disclaimer).toBeVisible({ timeout: 120000 })
    await expect(disclaimer).toContainText(/ai.generated|not authoritative/i)
  })

  test('AC3: confidence indicator present in root cause section', async ({ page }) => {
    await startAnalysis(page)

    await expect(page.getByTestId('confidence-badge')).toBeVisible({ timeout: 120000 })
    const badgeText = await page.getByTestId('confidence-badge').textContent()
    expect(['High', 'Medium', 'Low'].some((v) => badgeText?.includes(v))).toBe(true)
  })
})

// ─── Story 4.5 — Recommended next steps ──────────────────────────────────────

test.describe('Recommended next steps (story-4.5)', () => {
  test('AC1: "Recommended Next Steps" section visible after analysis completes', async ({
    page,
  }) => {
    await startAnalysis(page)

    await expect(page.locator('#nextsteps-heading')).toBeVisible({ timeout: 120000 })
    await expect(page.locator('#nextsteps-heading')).toContainText(/next steps/i)
  })

  test('AC4: AI disclaimer has no dismiss/close button', async ({ page }) => {
    await startAnalysis(page)

    const disclaimer = page.locator('[role="alert"][aria-label="AI-generated disclaimer"]')
    await expect(disclaimer).toBeVisible({ timeout: 120000 })
    // No dismiss button inside the disclaimer
    const dismissBtn = disclaimer.getByRole('button', { name: /dismiss|close|×/i })
    await expect(dismissBtn).toHaveCount(0)
  })
})

// ─── Story 5.2 — In-flight cancellation ──────────────────────────────────────

test.describe('In-flight analysis cancellation (story-5.2)', () => {
  test('AC1+AC3: Cancel button visible during analysis; clicking cancels and shows reset button', async ({
    page,
  }) => {
    await uploadLogFixture(page)

    // Confirm review to start analysis
    await page.getByRole('button', { name: /confirm and analyze/i }).click()

    // Cancel button should appear once analysis is in flight
    const cancelBtn = page.getByRole('button', { name: /cancel analysis/i })
    await expect(cancelBtn).toBeVisible({ timeout: 15000 })
    await cancelBtn.click()

    // "Start new analysis" should appear after cancellation
    await expect(
      page.getByRole('button', { name: /start new analysis/i }),
    ).toBeVisible({ timeout: 10000 })
  })

  test('AC4: Cancel button not visible when pipeline is idle', async ({ page }) => {
    await loginAndGoToAnalysis(page)
    const cancelBtn = page.getByRole('button', { name: /cancel analysis/i })
    await expect(cancelBtn).toHaveCount(0)
  })
})

// ─── Story 5.3 — Non-blocking UI ─────────────────────────────────────────────

test.describe('Non-blocking UI during analysis (story-5.3)', () => {
  test('AC1+AC2: navigating away during active analysis does not freeze the page', async ({
    page,
  }) => {
    // Collect JS errors
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await uploadLogFixture(page)
    await page.getByRole('button', { name: /confirm and analyze/i }).click()

    // Wait for analysis to start
    await expect(page.getByTestId('stage-analysing')).toBeVisible({ timeout: 15000 })

    // Navigate to dashboard — should work without error
    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/welcome back/i)

    // No JS errors during this flow
    expect(errors).toHaveLength(0)
  })
})

