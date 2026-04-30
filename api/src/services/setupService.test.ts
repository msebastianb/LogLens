/**
 * Unit tests for setupService.ts
 *
 * Mocks: db (Drizzle client), bcryptjs
 * Tests:
 *   isFirstRunComplete() — false when no row; true when value='true'
 *   createAdminUser()   — hashes password with cost 12; calls transaction
 *
 * [Source: story-1.3, task 4]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Declare mocks via vi.hoisted so they are available when vi.mock is hoisted
const { mockLimit, mockWhere, mockFrom, mockSelect, mockTransaction, mockBcryptHash } = vi.hoisted(() => {
  const mockLimit = vi.fn()
  const mockWhere = vi.fn(() => ({ limit: mockLimit }))
  const mockFrom = vi.fn(() => ({ where: mockWhere }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))
  const mockTransaction = vi.fn()
  const mockBcryptHash = vi.fn<(data: string, rounds: number) => Promise<string>>()
  return { mockLimit, mockWhere, mockFrom, mockSelect, mockTransaction, mockBcryptHash }
})

vi.mock('../db/client.js', () => ({
  db: {
    select: mockSelect,
    transaction: mockTransaction,
  },
}))

vi.mock('bcryptjs', () => ({
  default: { hash: mockBcryptHash },
}))

vi.mock('../config/env.js', () => ({
  env: { BCRYPT_ROUNDS: 12 },
}))

// Import AFTER mocking
import { isFirstRunComplete, createAdminUser } from './setupService.js'

describe('setupService', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Re-wire the mock chain after reset
    mockLimit.mockResolvedValue([])
    mockWhere.mockReturnValue({ limit: mockLimit })
    mockFrom.mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })
  })

  // ─── isFirstRunComplete ────────────────────────────────────────────────────

  describe('isFirstRunComplete()', () => {
    it('returns false when no row exists', async () => {
      mockLimit.mockResolvedValue([])
      expect(await isFirstRunComplete()).toBe(false)
    })

    it('returns true when row value is "true"', async () => {
      mockLimit.mockResolvedValue([{ key: 'first_run_complete', value: 'true', updatedAt: new Date() }])
      expect(await isFirstRunComplete()).toBe(true)
    })

    it('returns false when row value is "false"', async () => {
      mockLimit.mockResolvedValue([{ key: 'first_run_complete', value: 'false', updatedAt: new Date() }])
      expect(await isFirstRunComplete()).toBe(false)
    })
  })

  // ─── createAdminUser ───────────────────────────────────────────────────────

  describe('createAdminUser()', () => {
    const FAKE_HASH = '$2b$12$fakehashvalue000000000000000000000000000000000000000000'

    function buildMockTx() {
      return {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      }
    }

    it('calls bcrypt.hash with the password and configured BCRYPT_ROUNDS', async () => {
      mockBcryptHash.mockResolvedValue(FAKE_HASH)
      mockTransaction.mockImplementation(async (fn: (tx: ReturnType<typeof buildMockTx>) => Promise<void>) => {
        await fn(buildMockTx())
      })

      await createAdminUser('admin', 'securepassword')

      expect(mockBcryptHash).toHaveBeenCalledWith('securepassword', 12)
    })

    it('stores a hash that is different from the plain password', async () => {
      mockBcryptHash.mockResolvedValue(FAKE_HASH)
      let capturedPasswordHash: string | undefined

      mockTransaction.mockImplementation(async (fn: (tx: ReturnType<typeof buildMockTx>) => Promise<void>) => {
        const tx = buildMockTx()
        await fn(tx)
        // Capture what was passed to users insert
        const insertMock = tx.insert.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> }
        capturedPasswordHash = (insertMock.values.mock.calls[0] as [{ passwordHash: string }])[0]?.passwordHash
      })

      await createAdminUser('admin', 'securepassword')

      expect(capturedPasswordHash).toBe(FAKE_HASH)
      expect(capturedPasswordHash).not.toBe('securepassword')
      expect((capturedPasswordHash ?? '').length).toBeGreaterThanOrEqual(60)
    })

    it('wraps inserts in a transaction', async () => {
      mockBcryptHash.mockResolvedValue(FAKE_HASH)
      mockTransaction.mockResolvedValue(undefined)

      await createAdminUser('admin', 'securepassword')

      expect(mockTransaction).toHaveBeenCalledOnce()
    })
  })
})
