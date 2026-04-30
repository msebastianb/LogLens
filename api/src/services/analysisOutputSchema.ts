/**
 * Zod schema for the structured LLM analysis output.
 *
 * Used by the SSE stream route to validate the assembled LLM response before
 * emitting `event: complete`. A schema violation causes `event: error` instead.
 *
 * `nextSteps` requires at least one item (min 1) — an empty array is a
 * validation failure per Story 4.5 AC.
 *
 * [Source: architecture.md#data-exchange-formats, story-4.3, story-4.5]
 */
import { z } from 'zod'

export const AnalysisOutputSchema = z.object({
  errors: z.array(
    z.object({
      type: z.string(),
      count: z.number(),
      distribution: z.string(),
    }),
  ),
  anomalies: z.array(z.string()),
  rootCause: z.object({
    hypothesis: z.string(),
    confidence: z.enum(['High', 'Medium', 'Low']),
    evidenceExcerpts: z.array(z.string()),
  }),
  timeline: z.array(
    z.object({
      timestamp: z.string(),
      component: z.string(),
      event: z.string(),
    }),
  ),
  nextSteps: z.array(z.string()).min(1, 'nextSteps must contain at least one item'),
})

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>

/**
 * Parse and validate a raw LLM text response into a typed AnalysisOutput.
 *
 * Strips optional ```json ... ``` markdown fences before parsing — LLMs
 * sometimes wrap output in fences even when instructed not to.
 *
 * Throws if JSON is invalid or schema validation fails.
 */
export function parseAnalysisJson(text: string): AnalysisOutput {
  const stripped = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  let raw: unknown
  try {
    raw = JSON.parse(stripped)
  } catch {
    throw new Error('LLM response is not valid JSON')
  }

  const result = AnalysisOutputSchema.safeParse(raw)
  if (!result.success) {
    throw new Error('Schema validation failed: ' + JSON.stringify(result.error.flatten()))
  }
  return result.data
}
