/**
 * useAnalysisStream — opens an SSE connection to stream LLM analysis tokens.
 *
 * Token accumulation uses a `useRef<string>` — NOT `useState` — so that each
 * arriving token does NOT trigger a React re-render of the component tree.
 * The parent decides when to force a re-render by responding to `onComplete`.
 *
 * EventSource sends the httpOnly JWT cookie automatically with `withCredentials`.
 * No CSRF token is required for GET requests.
 *
 * [Source: story-5.3, AC3]
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { AnalysisOutput } from './analysisApi.js'

export function useAnalysisStream(
  jobId: string | null,
  onToken: (token: string) => void,
  onComplete: (output: AnalysisOutput) => void,
  onError: (detail: string) => void,
): { outputRef: RefObject<string> } {
  const outputRef = useRef<string>('')

  useEffect(() => {
    if (!jobId) return

    // Reset accumulator for new job
    outputRef.current = ''

    const es = new EventSource(`/api/v1/analysis-jobs/${jobId}/stream`, {
      withCredentials: true,
    })

    es.addEventListener('token', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { text: string }
      outputRef.current += payload.text
      onToken(payload.text)
    })

    es.addEventListener('complete', (e: MessageEvent) => {
      const output = JSON.parse(e.data) as AnalysisOutput
      es.close()
      onComplete(output)
    })

    es.addEventListener('error', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { message?: string }
      es.close()
      onError(payload.message ?? 'Stream error')
    })

    return () => {
      es.close()
    }
    // Callbacks are intentionally excluded from deps — they are expected to be
    // stable (e.g. wrapped in useCallback or dispatch functions).
    // Only jobId controls when the effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  return { outputRef }
}
