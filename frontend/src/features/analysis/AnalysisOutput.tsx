/**
 * AnalysisOutput — pure display component for structured LLM analysis results.
 *
 * Renders five sections: Errors & Frequency, Anomalies, Root Cause Hypothesis,
 * Event Timeline, Recommended Next Steps. Timeline is sorted chronologically (ISO
 * timestamps compare lexicographically). Carries a persistent non-dismissable
 * AI-generated banner at the top.
 *
 * [Source: story-4.4, AC1–AC5]
 */
import type { ReactNode } from 'react'
import type { AnalysisOutput } from './analysisApi.js'

interface Props {
  output: AnalysisOutput
}

const CONFIDENCE_BADGE: Record<string, string> = {
  high: 'bg-teal-50 text-teal-700 border-teal-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-700 border-red-200',
}

function SectionCard({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-zinc-100 bg-white px-5 py-4 space-y-3 shadow-sm">
      <h2 id={id} className="text-sm font-semibold text-zinc-900 uppercase tracking-wide">
        {heading}
      </h2>
      {children}
    </section>
  )
}

export default function AnalysisOutput({ output }: Props) {
  const sortedTimeline = [...output.timeline].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  )

  return (
    <div className="space-y-4">
      {/* AC4 — Persistent non-dismissable AI disclaimer banner */}
      <div
        role="alert"
        aria-label="AI-generated disclaimer"
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 flex items-center gap-2"
      >
        <span aria-hidden="true" className="text-amber-500">⚠</span>
        AI-generated — not authoritative. Verify findings before taking action.
      </div>

      {/* AC1, AC2 — Errors & Frequency */}
      <SectionCard id="errors-heading" heading="Errors &amp; Frequency">
        {output.errors.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No errors identified.</p>
        ) : (
          <ul className="space-y-2">
            {output.errors.map((err, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="font-mono font-medium text-zinc-900">{err.type}</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-700">{err.count}×</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500">{err.distribution}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* AC1 — Anomalies */}
      <SectionCard id="anomalies-heading" heading="Anomalies">
        {output.anomalies.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No anomalies identified.</p>
        ) : (
          <ul className="space-y-1.5 list-disc list-inside marker:text-zinc-300">
            {output.anomalies.map((anomaly, i) => (
              <li key={i} className="text-sm text-zinc-700">
                {anomaly}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* AC1, AC3, AC5 — Root Cause Hypothesis */}
      <SectionCard id="rootcause-heading" heading="Root Cause Hypothesis">
        <div className="flex items-start gap-3">
          <p className="text-sm flex-1 text-zinc-700 leading-relaxed">{output.rootCause.hypothesis}</p>
          <span
            data-testid="confidence-badge"
            className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${CONFIDENCE_BADGE[output.rootCause.confidence.toLowerCase()] ?? 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}
          >
            {output.rootCause.confidence}
          </span>
        </div>
        {output.rootCause.evidenceExcerpts.length > 0 && (
          <div className="space-y-2">
            {output.rootCause.evidenceExcerpts.map((excerpt, i) => (
              <blockquote
                key={i}
                className="border-l-2 border-teal-300 bg-zinc-50 pl-3 py-1.5 pr-2 text-xs text-zinc-600 font-mono rounded-r break-all overflow-hidden"
              >
                {excerpt}
              </blockquote>
            ))}
          </div>
        )}
      </SectionCard>

      {/* AC1, AC4 — Event Timeline */}
      <SectionCard id="timeline-heading" heading="Event Timeline">
        {sortedTimeline.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No timeline data.</p>
        ) : (
          <ol className="space-y-2">
            {sortedTimeline.map((entry, i) => (
              <li key={i} className="text-sm flex gap-2 items-baseline">
                <time className="font-mono text-xs text-zinc-400 shrink-0">{entry.timestamp}</time>
                <span className="font-medium text-zinc-600 shrink-0 text-xs">[{entry.component}]</span>
                <span className="text-zinc-700">{entry.event}</span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      {/* AC1 — Recommended Next Steps */}
      <SectionCard id="nextsteps-heading" heading="Recommended Next Steps">
        {output.nextSteps.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">No recommendations.</p>
        ) : (
          <ol className="space-y-2">
            {output.nextSteps.map((step, i) => (
              <li key={i} className="text-sm text-zinc-700 flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-teal-50 text-teal-600 font-semibold text-xs flex items-center justify-center border border-teal-100">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  )
}
