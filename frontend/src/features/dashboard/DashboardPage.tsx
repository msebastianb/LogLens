import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ScanSearch } from 'lucide-react'
import { getMe } from '../auth/authApi.js'

export default function DashboardPage() {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe, staleTime: 5 * 60 * 1000 })

  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
          Welcome back, {me?.username ?? '…'}
        </h1>
        <p className="text-sm text-zinc-500">Here's where you start your analysis.</p>
      </div>

      {/* CTA card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
            <ScanSearch className="w-5 h-5 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900">Analyze a log file</h2>
            <p className="text-sm text-zinc-500 mt-1 leading-relaxed">
              Upload any <span className="font-mono text-xs bg-zinc-100 px-1 py-0.5 rounded">.log</span>,{' '}
              <span className="font-mono text-xs bg-zinc-100 px-1 py-0.5 rounded">.json</span>, or{' '}
              <span className="font-mono text-xs bg-zinc-100 px-1 py-0.5 rounded">.ndjson</span> file. LogLens
              scrubs PII and secrets before anything reaches the AI, then surfaces errors, anomalies, and root
              causes — cutting investigation time from hours to minutes.
            </p>
          </div>
        </div>
        <Link
          to="/analysis"
          className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors duration-150 cursor-pointer"
        >
          Start New Analysis
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
