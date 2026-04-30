/**
 * RedactionReviewPanel — shows a summary of redactions found during scrubbing
 * and lets the user confirm they want to proceed with LLM analysis.
 *
 * [Source: story-5.5, AC2, AC7]
 */
import type { RedactionItem } from './analysisApi.js'

interface Props {
  redactionSummary: RedactionItem[]
  onConfirm: () => void
  onCancel?: () => void
  disabled?: boolean
}

export default function RedactionReviewPanel({ redactionSummary, onConfirm, onCancel, disabled = false }: Props) {
  // Group by type and count occurrences
  const counts: Record<string, number> = {}
  for (const item of redactionSummary) {
    counts[item.type] = (counts[item.type] ?? 0) + 1
  }
  const entries = Object.entries(counts)

  return (
    <section
      role="region"
      aria-label="Redaction review"
      className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Review before analysis</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          The following sensitive content was redacted before sending to the LLM:
        </p>
      </div>

      {redactionSummary.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No sensitive content detected in this log.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 border border-zinc-100 rounded-lg overflow-hidden">
          {entries.map(([type, count]) => (
            <li key={type} className="flex items-center justify-between px-4 py-2.5 text-sm font-mono bg-zinc-50/50 text-zinc-700">
              {type.toUpperCase()} — {count} removed
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          className="bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors duration-150 cursor-pointer"
        >
          Confirm and analyze
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
        >
          Cancel and start over
        </button>
      </div>
    </section>
  )
}
