/**
 * CancelButton — shows a Cancel button while an analysis job is in-flight,
 * and a "Start New Analysis" button after cancellation.
 *
 * Active states (shows "Cancel"):  fetching | scrubbing | analysing | streaming
 * Cancelled state (shows "Start New Analysis"): cancelled
 * Silent states (renders nothing): idle | awaiting-review | complete | error
 *
 * [Source: story-5.2, AC1, AC3, AC4]
 */
import type { PipelineStore } from './useAnalysisPipeline.js'
import { apiGet } from '../../lib/apiClient.js'

interface Props {
  jobId: string | null
  store: PipelineStore
  onCancel: () => void
}

const ACTIVE_STATES = new Set(['fetching', 'scrubbing', 'analysing', 'streaming'])

async function fetchCsrfToken(): Promise<string> {
  const data = await apiGet<{ token: string }>('/api/v1/csrf/token')
  return data.token
}

export function CancelButton({ jobId, store, onCancel }: Props) {
  if (ACTIVE_STATES.has(store.state)) {
    async function handleCancel() {
      try {
        if (jobId) {
          const token = await fetchCsrfToken()
          await fetch(`/api/v1/analysis-jobs/${jobId}`, {
            method: 'DELETE',
            headers: { 'x-csrf-token': token },
            credentials: 'include',
          })
        }
      } finally {
        onCancel()
      }
    }

    return (
      <button
        type="button"
        onClick={() => void handleCancel()}
        className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors duration-150 cursor-pointer"
      >
        Cancel analysis
      </button>
    )
  }

  if (store.state === 'cancelled') {
    return (
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors duration-150 cursor-pointer"
      >
        Start new analysis
      </button>
    )
  }

  return null
}
