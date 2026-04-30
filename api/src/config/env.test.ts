import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for Zod environment variable validation (api/src/config/env.ts).
 *
 * Strategy: manipulate process.env and re-import the module via dynamic import
 * with the module cache cleared so each test gets a fresh validation run.
 * process.exit(1) is mocked to throw so tests don't actually exit.
 *
 * [Source: Story 1.1 task 8]
 */

const VALID_ENV = {
  DATABASE_URL: 'postgres://user:pass@postgres:5432/loglens',
  REDIS_URL: 'redis://redis:6379',
  JWT_SECRET: 'supersecretjwtsecretlongenough32!!',
  NODE_ENV: 'test',
}

function withEnv(overrides: Record<string, string | undefined>) {
  const original = { ...process.env }
  // Clear all env and apply only the test env
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
  // Set base env
  for (const [k, v] of Object.entries(VALID_ENV)) {
    process.env[k] = v
  }
  // Apply overrides: set if string, delete if undefined
  // NOTE: process.env coerces undefined to the string "undefined", so we must
  //       explicitly delete keys rather than assigning undefined.
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = v
    }
  }
  return () => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, original)
  }
}

describe('env validation', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      throw new Error(`process.exit(${code})`)
    })
    vi.resetModules()
  })

  afterEach(() => {
    exitSpy.mockRestore()
    vi.resetModules()
  })

  it('passes with all required variables present', async () => {
    const restore = withEnv({})
    try {
      const { env } = await import('./env.js')
      expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL)
      expect(env.REDIS_URL).toBe(VALID_ENV.REDIS_URL)
      expect(env.JWT_SECRET).toBe(VALID_ENV.JWT_SECRET)
    } finally {
      restore()
    }
  })

  it('exits with 1 when DATABASE_URL is missing', async () => {
    const restore = withEnv({ DATABASE_URL: undefined })
    try {
      await expect(import('./env.js')).rejects.toThrow('process.exit(1)')
    } finally {
      restore()
    }
  })

  it('exits with 1 when REDIS_URL is missing', async () => {
    const restore = withEnv({ REDIS_URL: undefined })
    try {
      await expect(import('./env.js')).rejects.toThrow('process.exit(1)')
    } finally {
      restore()
    }
  })

  it('exits with 1 when JWT_SECRET is shorter than 32 characters', async () => {
    const restore = withEnv({ JWT_SECRET: 'tooshort' })
    try {
      await expect(import('./env.js')).rejects.toThrow('process.exit(1)')
    } finally {
      restore()
    }
  })

  it('uses default SESSION_TTL_SECONDS of 28800 when not provided', async () => {
    const restore = withEnv({ SESSION_TTL_SECONDS: undefined })
    try {
      const { env } = await import('./env.js')
      expect(env.SESSION_TTL_SECONDS).toBe(28800)
    } finally {
      restore()
    }
  })

  it('parses HTTPS_ONLY=true as boolean true', async () => {
    const restore = withEnv({ HTTPS_ONLY: 'true' })
    try {
      const { env } = await import('./env.js')
      expect(env.HTTPS_ONLY).toBe(true)
    } finally {
      restore()
    }
  })

  it('parses HTTPS_ONLY=false as boolean false', async () => {
    const restore = withEnv({ HTTPS_ONLY: 'false' })
    try {
      const { env } = await import('./env.js')
      expect(env.HTTPS_ONLY).toBe(false)
    } finally {
      restore()
    }
  })
})
