/**
 * Analysis job routes.
 *
 * POST /api/v1/analysis-jobs
 *   Creates a new analysis job from a scrub-cache entry, stores job state
 *   in Redis, and returns { jobId }. LLM streaming happens on the GET route.
 *
 * GET /api/v1/analysis-jobs/:id/stream
 *   Server-Sent Events stream. Initiates the LLM call, forwards tokens as
 *   `event: token` events, and emits `event: complete` (validated structured
 *   JSON) or `event: error` (RFC 7807) when the stream ends.
 *
 * DELETE /api/v1/analysis-jobs/:id
 *   Cancels an in-progress job: aborts the LLM stream, deletes the scrub-cache
 *   entry, and marks the job cancelled in Redis. Idempotent for terminal jobs.
 *
 * Error responses (RFC 7807 via @fastify/sensible):
 *   401 — unauthenticated
 *   403 — job belongs to a different user
 *   404 — cacheId / jobId not found or expired
 *   503 — no LLM provider configured
 *
 * Requires: authenticated session (JWT cookie).
 * [Source: story-4.3, AC1–AC5; story-5.2, AC1–AC5]
 */
import type { FastifyInstance } from 'fastify'
import type { ServerResponse } from 'node:http'
import { env } from '../config/env.js'
import { llmProviderFactory, ConfigurationError } from '../services/llmProvider.js'
import * as scrubCache from '../services/scrubCache.js'
import { redis } from '../services/redisClient.js'
import { parseAnalysisJson } from '../services/analysisOutputSchema.js'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AnalysisJob {
  status: 'pending' | 'complete' | 'error' | 'cancelled'
  userId: number
  cacheId: string
  createdAt: string
}

interface PostBody {
  cacheId: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function jobKey(jobId: string): string {
  return `analysis_job:${jobId}`
}

function sendEvent(raw: ServerResponse, event: string, data: unknown): void {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// gpt-5.4-mini: 400 K context window, 128 K max output tokens.
// 1 token ≈ 4 chars on average.
// Reserve ~8 K tokens for the system prompt overhead,
// leaving ~392 K input tokens ≈ 1.57 M chars per chunk.
const MAX_CHUNK_CHARS = 1_570_000

function buildChunkPrompt(scrubbedText: string, chunkIndex: number, totalChunks: number): string {
  const chunkNote = totalChunks > 1
    ? `This is chunk ${chunkIndex + 1} of ${totalChunks}. Analyse only this portion.`
    : ''

  return [
    'You are a log analysis expert. Analyse the following scrubbed log content.',
    chunkNote,
    'Respond ONLY with a JSON object (no markdown fences, no prose) matching this schema:',
    '{ "errors": [{ "type": string, "count": number, "distribution": string }],',
    '  "anomalies": [string],',
    '  "rootCause": { "hypothesis": string, "confidence": "High"|"Medium"|"Low", "evidenceExcerpts": [string] },',
    '  "timeline": [{ "timestamp": string, "component": string, "event": string }],',
    '  "nextSteps": [string] }',
    '',
    'Log content:',
    scrubbedText,
  ].join('\n')
}

function buildMergePrompt(partialResults: string[]): string {
  return [
    'You are a log analysis expert. Below are partial analysis results (JSON objects) from different chunks of the same log file.',
    'Merge them into a single coherent JSON object following the same schema:',
    '{ "errors": [{ "type": string, "count": number, "distribution": string }],',
    '  "anomalies": [string],',
    '  "rootCause": { "hypothesis": string, "confidence": "High"|"Medium"|"Low", "evidenceExcerpts": [string] },',
    '  "timeline": [{ "timestamp": string, "component": string, "event": string }],',
    '  "nextSteps": [string] }',
    '',
    'Rules:',
    '- Combine "errors": group by type, sum counts, merge distributions.',
    '- De-duplicate "anomalies".',
    '- Pick the single best "rootCause" across all chunks (highest confidence wins, break ties by strongest evidence).',
    '- Merge and sort "timeline" entries chronologically.',
    '- De-duplicate and merge "nextSteps".',
    '',
    'Respond ONLY with the merged JSON object (no markdown fences, no prose).',
    '',
    ...partialResults.map((r, i) => `=== Chunk ${i + 1} result ===\n${r}\n`),
  ].join('\n')
}

/** Split text into chunks of at most `maxChars`, breaking at newlines. */
function splitLogIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const chunks: string[] = []
  let offset = 0
  while (offset < text.length) {
    let end = offset + maxChars
    if (end < text.length) {
      // Try to break at a newline within the last 10% of the chunk
      const searchStart = Math.max(offset, end - Math.floor(maxChars * 0.1))
      const lastNewline = text.lastIndexOf('\n', end)
      if (lastNewline > searchStart) {
        end = lastNewline + 1
      }
    } else {
      end = text.length
    }
    chunks.push(text.slice(offset, end))
    offset = end
  }
  return chunks
}

// ─── Per-job AbortController registry ──────────────────────────────────────
// Keyed by jobId. Allows DELETE /analysis-jobs/:id to abort an in-flight GET
// stream that is running in a separate HTTP request.
export const jobControllers = new Map<string, AbortController>()

// ─── Route plugin ────────────────────────────────────────────────────────────

export async function analysisRoute(app: FastifyInstance) {
  // ── POST /api/v1/analysis-jobs ────────────────────────────────────────────
  app.post<{ Body: PostBody }>(
    '/api/v1/analysis-jobs',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const { cacheId } = req.body ?? {}

      if (!cacheId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'cacheId is required',
        })
      }

      // Verify the scrub-cache entry exists for this user
      const cachedText = await scrubCache.get(userId, cacheId)
      if (!cachedText) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Cache entry not found or expired',
        })
      }

      // Validate LLM provider is configured
      try {
        llmProviderFactory(env)
      } catch (err) {
        if (err instanceof ConfigurationError) {
          return reply.status(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            message: err.message,
          })
        }
        throw err
      }

      // Store job state in Redis and register abort controller
      const jobId = crypto.randomUUID()
      const controller = new AbortController()
      jobControllers.set(jobId, controller)
      const job: AnalysisJob = {
        status: 'pending',
        userId,
        cacheId,
        createdAt: new Date().toISOString(),
      }
      await redis.set(jobKey(jobId), JSON.stringify(job), 'EX', env.SESSION_TTL_SECONDS)

      return reply.status(201).send({ jobId })
    },
  )

  // ── GET /api/v1/analysis-jobs/:id/stream ─────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/analysis-jobs/:id/stream',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const { id: jobId } = req.params

      // Look up job
      const raw = await redis.get(jobKey(jobId))
      if (!raw) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Analysis job not found or expired',
        })
      }

      const job = JSON.parse(raw) as AnalysisJob

      // Ownership check
      if (job.userId !== userId) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You do not have access to this analysis job',
        })
      }

      // Retrieve scrubbed text
      const scrubbedText = await scrubCache.get(userId, job.cacheId)
      if (!scrubbedText) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Scrub cache entry expired before streaming could begin',
        })
      }

      // Get LLM provider — errors already validated at POST time, but guard anyway
      let provider: ReturnType<typeof llmProviderFactory>
      try {
        provider = llmProviderFactory(env)
      } catch (err) {
        if (err instanceof ConfigurationError) {
          return reply.status(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            message: err.message,
          })
        }
        throw err
      }

      // Use the registered controller signal so DELETE can abort the stream.
      // Fall back to req.signal (client disconnect) if controller is missing.
      const controller = jobControllers.get(jobId)
      const signal = controller?.signal ?? req.signal

      // Open SSE stream
      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.flushHeaders()

      let fullText = ''
      let finalStatus: 'complete' | 'error' | 'aborted' = 'complete'

      try {
        const chunks = splitLogIntoChunks(scrubbedText, MAX_CHUNK_CHARS)
        const totalChunks = chunks.length

        sendEvent(reply.raw, 'progress', {
          stage: 'analysing',
          totalChunks,
          currentChunk: 0,
        })

        if (totalChunks === 1) {
          // ── Single-chunk fast path (most common) ──
          const prompt = buildChunkPrompt(chunks[0], 0, 1)
          for await (const token of provider.stream(prompt, signal)) {
            fullText += token
            sendEvent(reply.raw, 'token', { text: token })
          }
        } else {
          // ── Multi-chunk: analyse each, then merge ──
          const partialResults: string[] = []

          for (let i = 0; i < totalChunks; i++) {
            signal.throwIfAborted()
            sendEvent(reply.raw, 'progress', {
              stage: 'analysing',
              totalChunks,
              currentChunk: i + 1,
            })

            let chunkResult = ''
            const prompt = buildChunkPrompt(chunks[i], i, totalChunks)
            for await (const token of provider.stream(prompt, signal)) {
              chunkResult += token
              // Stream chunk tokens so the UI shows progress
              sendEvent(reply.raw, 'token', { text: token })
            }
            partialResults.push(chunkResult)
          }

          // ── Merge pass ──
          signal.throwIfAborted()
          sendEvent(reply.raw, 'progress', { stage: 'merging', totalChunks, currentChunk: totalChunks })

          fullText = ''
          const mergePrompt = buildMergePrompt(partialResults)
          for await (const token of provider.stream(mergePrompt, signal)) {
            fullText += token
            sendEvent(reply.raw, 'token', { text: token })
          }
        }

        // Validate assembled output
        try {
          const output = parseAnalysisJson(fullText)
          sendEvent(reply.raw, 'complete', output)
        } catch {
          finalStatus = 'error'
          sendEvent(reply.raw, 'error', {
            statusCode: 502,
            error: 'Bad Gateway',
            message: 'LLM returned invalid structured output',
          })
        }
      } catch (err) {
        // Distinguish an intentional abort (DELETE cancel) from a real LLM error.
        // AbortError means the DELETE handler already wrote 'cancelled' to Redis —
        // do not overwrite it with 'error'.
        if (err instanceof Error && err.name === 'AbortError') {
          finalStatus = 'aborted'
        } else {
          finalStatus = 'error'
          const message = err instanceof Error ? err.message : 'LLM stream failed'
          sendEvent(reply.raw, 'error', {
            statusCode: 502,
            error: 'Bad Gateway',
            message,
          })
        }
      }

      // Update job status — always end the SSE connection even if Redis fails.
      // Skip the Redis write when aborted: the DELETE handler already wrote 'cancelled'.
      try {
        if (finalStatus !== 'aborted') {
          const updatedJob: AnalysisJob = { ...job, status: finalStatus }
          await redis.set(jobKey(jobId), JSON.stringify(updatedJob), 'EX', env.SESSION_TTL_SECONDS)
        }
      } finally {
        jobControllers.delete(jobId)
        reply.raw.end()
      }
      return reply
    },
  )

  // ── DELETE /api/v1/analysis-jobs/:id ─────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/analysis-jobs/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const { id: jobId } = req.params

      const raw = await redis.get(jobKey(jobId))
      if (!raw) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Analysis job not found or expired',
        })
      }

      const job = JSON.parse(raw) as AnalysisJob

      if (job.userId !== userId) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You do not have access to this analysis job',
        })
      }

      // Idempotent — job already in a terminal state
      if (job.status === 'complete' || job.status === 'error' || job.status === 'cancelled') {
        return reply.status(204).send()
      }

      // Abort in-flight LLM stream
      const controller = jobControllers.get(jobId)
      controller?.abort()
      jobControllers.delete(jobId)

      // Delete scrub-cache entry
      await scrubCache.del(userId, job.cacheId)

      // Update job status to cancelled
      const updatedJob: AnalysisJob = { ...job, status: 'cancelled' }
      await redis.set(jobKey(jobId), JSON.stringify(updatedJob), 'EX', env.SESSION_TTL_SECONDS)

      return reply.status(204).send()
    },
  )
}
