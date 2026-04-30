/**
 * Unit tests for runMigrations() — drizzle-orm/node-postgres/migrator.
 *
 * Mocks out the migrator + db client; no real DB needed.
 * [Source: story-1.2 AC2, task 6]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks declared before any imports ────────────────────────────────
vi.mock('drizzle-orm/node-postgres/migrator', () => ({
  migrate: vi.fn(),
}))

// client.ts creates a real pg.Pool at import — mock it out entirely
vi.mock('./client.js', () => ({
  db: {},
  pool: {},
}))

describe('runMigrations', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('calls migrate() exactly once on success', async () => {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    const mockMigrate = vi.mocked(migrate)
    mockMigrate.mockResolvedValueOnce(undefined)

    const { runMigrations } = await import('./migrate.js')
    await runMigrations()

    expect(mockMigrate).toHaveBeenCalledOnce()
  })

  it('passes a migrationsFolder string to migrate()', async () => {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    const mockMigrate = vi.mocked(migrate)
    mockMigrate.mockResolvedValueOnce(undefined)

    const { runMigrations } = await import('./migrate.js')
    await runMigrations()

    const callArg = mockMigrate.mock.calls[0]?.[1]
    expect(callArg).toMatchObject({ migrationsFolder: expect.stringContaining('migrations') })
  })

  it('throws when migrate() rejects', async () => {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    const mockMigrate = vi.mocked(migrate)
    mockMigrate.mockRejectedValueOnce(new Error('connection refused'))

    const { runMigrations } = await import('./migrate.js')
    await expect(runMigrations()).rejects.toThrow('connection refused')
  })
})
