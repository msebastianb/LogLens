/**
 * Unit tests for helmetPlugin — verifies security response headers.
 * [Source: story-1.6, task 4, AC1]
 */
import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import helmetPlugin from './helmet.js'

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LLM_BASE_URL: undefined,
  },
}))

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(helmetPlugin)
  app.get('/', async () => ({ ok: true }))
  return app
}

describe('helmetPlugin', () => {
  it('sets Content-Security-Policy header containing default-src', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/)
    await app.close()
  })

  it("sets X-Frame-Options to DENY", async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.headers['x-frame-options']).toBe('DENY')
    await app.close()
  })

  it('sets X-Content-Type-Options to nosniff', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    await app.close()
  })

  it('sets Strict-Transport-Security header', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['strict-transport-security']).toContain('max-age')
    await app.close()
  })
})
