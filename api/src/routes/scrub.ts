/**
 * POST /api/v1/scrub
 *
 * Scrubs text of PII and secrets via the scrubber service.
 * Accepts an optional `custom_patterns` array of regex strings for
 * organisation-specific sensitive data redaction.
 *
 * Error responses (RFC 7807 via @fastify/sensible):
 *   422 — invalid custom_patterns (invalid regex forwarded from scrubber)
 *   502 — scrubber service returned an error or is unreachable
 *   504 — scrubber service timed out
 *
 * Requires: authenticated session (JWT cookie).
 * [Source: story-3.4, AC1, AC2, AC3, AC4]
 */
import type { FastifyInstance } from 'fastify'
import { scrubText, ScrubUnavailableError, ScrubTimeoutError, ScrubValidationError } from '../services/scrubService.js'

interface ScrubBody {
  text: string
  custom_patterns?: string[]
}

export async function scrubRoute(app: FastifyInstance) {
  app.post<{ Body: ScrubBody }>(
    '/api/v1/scrub',
    {
      onRequest: [app.authenticate],
    },
    async (req, reply) => {
      const { text, custom_patterns } = req.body

      let result: Awaited<ReturnType<typeof scrubText>>
      try {
        result = await scrubText(text, {
          customPatterns: custom_patterns,
        })
      } catch (err) {
        if (err instanceof ScrubValidationError) {
          return reply.status(422).send({ message: 'Scrubber returned a validation error' })
        }
        if (err instanceof ScrubTimeoutError) {
          return reply.status(504).send({ message: 'Scrubber service timed out' })
        }
        if (err instanceof ScrubUnavailableError) {
          return reply.status(502).send({ message: err.message })
        }
        throw err
      }

      return reply.send({
        redacted_text: result.redactedText,
        redaction_summary: result.redactionSummary,
      })
    },
  )
}
