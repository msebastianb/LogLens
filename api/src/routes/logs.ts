/**
 * POST /api/v1/logs/upload
 *
 * Accepts a single multipart file upload, validates its type and size,
 * parses it into an array of log lines, scrubs PII/secrets via the
 * scrubber service, caches the result in Redis, and returns a cache reference.
 *
 * Supported extensions: .log, .json, .ndjson
 * Max size: MAX_LOG_SIZE_MB from env (default 10 MB)
 *
 * Error responses (RFC 7807 via @fastify/sensible):
 *   400 — no file field found
 *   413 — file exceeds size limit
 *   415 — unsupported file extension
 *   422 — file is structurally malformed (parse error)
 *   502 — scrubber service returned an error or is unreachable
 *   504 — scrubber service timed out
 *
 * Requires: authenticated session (JWT cookie).
 * [Source: story-2.4, story-3.1, AC1, AC2, AC3]
 */
import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
import { parseLogFile, ParseError } from '../services/logFileParser.js'
import { scrubText, ScrubUnavailableError, ScrubTimeoutError } from '../services/scrubService.js'
import * as scrubCache from '../services/scrubCache.js'

const ALLOWED_EXTENSIONS = ['.log', '.json', '.ndjson']

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

export async function logsRoute(app: FastifyInstance) {
  app.post(
    '/api/v1/logs/upload',
    {
      onRequest: [app.authenticate],
    },
    async (req, reply) => {
      // @fastify/multipart must be registered on the Fastify instance before this route
      // runs. We use the limits option to cap the file size.
      const sizeLimit = env.MAX_LOG_SIZE_MB * 1024 * 1024

      let data: Awaited<ReturnType<typeof req.file>>
      try {
        data = await req.file({ limits: { fileSize: sizeLimit } })
      } catch (err: unknown) {
        // @fastify/multipart throws a RequestFileTooLargeError when the file
        // exceeds the configured fileSize limit.
        const code = (err as { code?: string }).code
        if (code === 'FST_FILES_LIMIT' || code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.payloadTooLarge('File exceeds the maximum allowed size')
        }
        throw err
      }

      if (!data) {
        return reply.badRequest('No file field in request')
      }

      const ext = getExtension(data.filename)
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        // Drain the stream to avoid socket leaks
        await data.toBuffer().catch(() => undefined)
        return reply.unsupportedMediaType(`Unsupported file type: ${ext || '(none)'}`)
      }

      // Read full buffer — size is already capped by limits.fileSize above.
      let buffer: Buffer
      try {
        buffer = await data.toBuffer()
      } catch (err: unknown) {
        const code = (err as { code?: string }).code
        if (code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.payloadTooLarge('File exceeds the maximum allowed size')
        }
        throw err
      }

      // Double-check extension after reading (paranoia — already checked above)
      const content = buffer.toString('utf-8')

      let lines: string[]
      try {
        lines = parseLogFile(data.filename, content)
      } catch (err) {
        if (err instanceof ParseError) {
          return reply
            .status(422)
            .send({ message: err.message, lineNumber: err.lineNumber ?? null })
        }
        throw err
      }

      // ─── Scrub: send raw text to scrubber, never cache raw content ─────────
      const rawText = lines.join('\n')
      let scrubResult: Awaited<ReturnType<typeof scrubText>>
      try {
        scrubResult = await scrubText(rawText)
      } catch (err) {
        if (err instanceof ScrubTimeoutError) {
          return reply.status(504).send({ message: 'Scrubber service timed out' })
        }
        if (err instanceof ScrubUnavailableError) {
          return reply.status(502).send({ message: err.message })
        }
        throw err
      }

      // ─── Cache: store only the scrubbed text (never the raw) ──────────────
      const cacheId = crypto.randomUUID()
      const userId = (req.user as { id: number }).id
      await scrubCache.set(userId, cacheId, scrubResult.redactedText)

      return reply.send({
        cacheId,
        lineCount: lines.length,
        redactionSummary: scrubResult.redactionSummary,
      })
    },
  )
}
