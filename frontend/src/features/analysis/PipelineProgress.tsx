/**
 * PipelineProgress — displays the current state of the analysis pipeline.
 *
 * Each stage row shows one of three states:
 *   ✓  — completed (stage is in store.completedStages)
 *   …  — active (current stage or streaming sub-state of analysing)
 *   —  — pending (not yet reached)
 *
 * Hidden entirely when store.state === 'idle'.
 * Error detail rendered inline below the failing stage row.
 *
 * [Source: story-5.1, AC1–AC6]
 */
import type { PipelineStore, PipelineState } from './useAnalysisPipeline.js'

interface Props {
  store: PipelineStore
}

const STAGES: PipelineState[] = [
  'fetching',
  'scrubbing',
  'awaiting-review',
  'analysing',
  'complete',
]

const STAGE_LABELS: Record<string, string> = {
  fetching: 'Fetching logs…',
  scrubbing: 'Scrubbing for PII and secrets…',
  'awaiting-review': 'Awaiting redaction review…',
  analysing: 'Analysing with LLM…',
  // streaming is a sub-state of analysing — same label
  streaming: 'Analysing with LLM…',
  complete: 'Analysis complete',
}

export default function PipelineProgress({ store }: Props) {
  if (store.state === 'idle') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-zinc-100 bg-white px-5 py-4 space-y-2 shadow-sm"
    >
      {STAGES.map(stage => {
        const isDone =
          store.completedStages.includes(stage) ||
          // streaming is a sub-state of analysing — treat analysing as done
          // once streaming has completed
          (stage === 'analysing' && store.completedStages.includes('streaming'))
        // streaming is visually part of "analysing" row — show active for both
        const isActive =
          store.state === stage ||
          (stage === 'analysing' && store.state === 'streaming')
        const isErrorStage = store.state === 'error' && store.errorStage === stage

        const dotClass = isDone
          ? 'bg-teal-500'
          : isActive
            ? 'bg-blue-500 animate-pulse'
            : isErrorStage
              ? 'bg-red-500'
              : 'bg-zinc-200'

        const labelClass = isDone
          ? 'text-zinc-600'
          : isActive
            ? 'font-medium text-zinc-900'
            : isErrorStage
              ? 'text-red-700 font-medium'
              : 'text-zinc-300'

        const indicator = isDone ? '✓' : isActive ? '…' : isErrorStage ? '✗' : '—'

        return (
          <div key={stage} data-testid={`stage-${stage}`} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-3 text-sm">
              <span aria-hidden="true" className={`flex-shrink-0 w-2 h-2 rounded-full ${dotClass}`} />
              <span className="sr-only">{indicator}</span>
              <span className={labelClass}>{STAGE_LABELS[stage]}</span>
            </div>
            {isErrorStage && store.errorDetail && (
              <p role="alert" className="text-xs text-red-600 ml-5">
                {store.errorDetail}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
