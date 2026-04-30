/**
 * Unit tests for authService.ts
 *
 * Mocks: db (Drizzle), bcryptjs
 * Tests:
 *   verifyPassword() — returns user on valid match
 *   verifyPassword() — returns null on wrong password
 *   verifyPassword() — returns null (with dummy hash) when user not found
 *
 * [Source: story-1.4, task 7]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockLimit, mockWhere, mockFrom, mockSelect, mockCompare, mockHash } = vi.hoisted(() => {
  const mockLimit = vi.fn()
  const mockWhere = vi.fn(() => ({ limit: mockLimit }))
  const mockFrom = vi.fn(() => ({ where: mockWhere }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))
  const mockCompare = vi.fn<(plain: string, hash: string) => Promise<boolean>>()
  const mockHash = vi.fn<(data: string, rounds: number) => Promise<string>>()
  return { mockLimit, mockWhere, mockFrom, mockSelect, mockCompare, mockHash }
})

vi.mock('../db/client.js', () => ({
  db: { select: mockSelect },
}))

vi.mock('bcryptjs', () => ({
  default: { compare: mockCompare, hash: mockHash },
}))

vi.mock('../config/env.js', () => ({
  env: { BCRYPT_ROUNDS: 8 },
}))

import { verifyPassword } from './authService.js'

const FAKE_USER = { id: 1, username: 'admin', passwordHash: '$2b$12$fakehash', createdAt: new Date() }

describe('verifyPassword()', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockHash.mockResolvedValue('$2b$08$fakehashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
    mockWhere.mockReturnValue({ limit: mockLimit })
    mockFrom.mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })
  })

  it('returns user object when credentials are correct', async () => {
    mockLimit.mockResolvedValue([FAKE_USER])
    mockCompare.mockResolvedValue(true)

    const result = await verifyPassword('admin', 'correctpassword')

    expect(result).toEqual({ id: 1, username: 'admin' })
    expect(mockCompare).toHaveBeenCalledWith('correctpassword', FAKE_USER.passwordHash)
  })

  it('returns null when password is wrong', async () => {
    mockLimit.mockResolvedValue([FAKE_USER])
    mockCompare.mockResolvedValue(false)

    const result = await verifyPassword('admin', 'wrongpassword')

    expect(result).toBeNull()
  })

  it('returns null when username is not found (runs dummy compare)', async () => {
    mockLimit.mockResolvedValue([])
    mockCompare.mockResolvedValue(false)

    const result = await verifyPassword('nonexistent', 'anypassword')

    expect(result).toBeNull()
    // Dummy compare must still be called to prevent timing attacks
    expect(mockCompare).toHaveBeenCalledOnce()
  })
})
