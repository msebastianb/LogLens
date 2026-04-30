/**
 * Setup routes — first-run wizard API.
 *
 * GET  /api/v1/setup  — returns { firstRunComplete: boolean } (public)
 * POST /api/v1/setup  — creates admin user; 400 on validation, 409 if already done
 *
 * Both endpoints are public (no auth) — they exist before any user exists.
 * [Source: story-1.3, architecture.md#authentication-security]
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { isFirstRunComplete, createAdminUser } from '../services/setupService.js'
import type { DatabaseError } from 'pg'

const setupBodySchema = z.object({
  username: z.string().min(1, 'Username is required').max(64, 'Username too long'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
})

export async function setupRoute(app: FastifyInstance): Promise<void> {
  // GET /api/v1/setup — SPA uses this to decide whether to show wizard
  app.get('/api/v1/setup', async (_req, reply) => {
    const firstRunComplete = await isFirstRunComplete()
    return reply.send({ firstRunComplete })
  })

  // POST /api/v1/setup — create admin account
  app.post('/api/v1/setup', async (req, reply) => {
    // Zod body validation
    const parsed = setupBodySchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Invalid request'
      return reply.badRequest(msg)
    }

    const { username, password } = parsed.data

    // Reject if already configured
    if (await isFirstRunComplete()) {
      return reply.conflict('Setup already complete')
    }

    try {
      await createAdminUser(username, password)
    } catch (err) {
      const dbErr = err as DatabaseError
      if (dbErr.code === '23505') {
        return reply.conflict('Username already taken')
      }
      throw err
    }

    return reply.code(200).send({ message: 'Admin account created' })
  })
}
