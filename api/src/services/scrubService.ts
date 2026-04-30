/**
 * scrubService — calls the FastAPI scrubber service to redact PII and secrets.
 *
 * POST http://scrubber:8001/scrub  (URL from env.SCRUBBER_URL)
 *
 * Error classes:
 *   ScrubTimeoutError     — scrubber exceeded SCRUBBER_TIMEOUT_MS → HTTP 504
 *   ScrubUnavailableError — unreachable or non-200 response       → HTTP 502
 *   ScrubValidationError  — scrubber returned 422 (e.g. invalid custom_patterns) → HTTP 422
 *
 * [Source: story-3.1, AC1, AC3, AC4; story-3.4, AC1, AC3]
 */
import { env } from '../config/env.js'

export class ScrubTimeoutError extends Error {
  constructor() {
    super('Scrubber service timed out')
    this.name = 'ScrubTimeoutError'
  }
}

export class ScrubUnavailableError extends Error {
  constructor(detail?: string) {
    super(detail ?? 'Scrubber service is unavailable')
    this.name = 'ScrubUnavailableError'
  }
}

export class ScrubValidationError extends Error {
  detail: unknown
  constructor(detail: unknown) {
    super('Scrubber returned 422 validation error')
    this.name = 'ScrubValidationError'
    this.detail = detail
  }
}

export interface RedactionItem {
  entity_type: string
  start: number
  end: number
  placeholder: string
}

export interface ScrubResult {
  redactedText: string
  redactionSummary: RedactionItem[]
}

/**
 * Send raw log text to the scrubber and return the redacted text + summary.
 *
 * @param text     Raw log content (joined lines).
 * @param options  Optional parameters: customPatterns for organisation-specific regex patterns.
 * @param signal   Optional AbortSignal for caller-initiated cancellation.
 */
export async function scrubText(
  text: string,
  options?: { customPatterns?: string[] },
  signal?: AbortSignal,
): Promise<ScrubResult> {
  const url = `${env.SCRUBBER_URL}/scrub`

  // Compose timeout + optional caller signal
  const timeoutSignal = AbortSignal.timeout(env.SCRUBBER_TIMEOUT_MS)
  const combinedSignal =
    signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  // Build request body — include custom_patterns only when provided and non-empty
  const bodyPayload: Record<string, unknown> = { text }
  if (options?.customPatterns?.length) {
    bodyPayload.custom_patterns = options.customPatterns
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal: combinedSignal,
    })
  } catch (err: unknown) {
    const name = (err as Error).name
    if (name === 'TimeoutError' || name === 'AbortError') {
      // Distinguish timeout (from our signal) from caller abort
      if (timeoutSignal.aborted) throw new ScrubTimeoutError()
    }
    throw new ScrubUnavailableError(
      `Scrubber unreachable: ${(err as Error).message}`,
    )
  }

  if (res.status === 422) {
    const detail = await res.json().catch(() => null)
    throw new ScrubValidationError(detail)
  }

  if (!res.ok) {
    throw new ScrubUnavailableError(`Scrubber returned ${res.status}`)
  }

  const body = (await res.json()) as {
    redacted_text: string
    redaction_summary: RedactionItem[]
  }

  return {
    redactedText: body.redacted_text,
    redactionSummary: body.redaction_summary,
  }
}
