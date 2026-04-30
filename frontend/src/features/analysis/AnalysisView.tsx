/**
 * AnalysisView — top-level orchestrator for the /analysis route.
 *
 * Wires together the full pipeline:
 *   idle → FileUpload → awaiting-review → RedactionReviewPanel
 *       → analysing/streaming → CancelButton + token output
 *       → complete → AnalysisOutput + "Start New Analysis"
 *
 * [Source: story-5.5, AC1–AC7]
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useAnalysisPipeline } from './useAnalysisPipeline.js'
import { useAnalysisStream } from './useAnalysisStream.js'
import { postAnalysisJob } from './analysisApi.js'
import type { UploadResult, AnalysisOutput, RedactionItem } from './analysisApi.js'
import FileUpload from './FileUpload.js'
import PipelineProgress from './PipelineProgress.js'
import RedactionReviewPanel from './RedactionReviewPanel.js'
import { CancelButton } from './CancelButton.js'
import AnalysisOutputComponent from './AnalysisOutput.js'

export default function AnalysisView() {
  const [store, dispatch] = useAnalysisPipeline()
  const [cacheId, setCacheId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [redactionSummary, setRedactionSummary] = useState<RedactionItem[]>([])
  const [analysisOutput, setAnalysisOutput] = useState<AnalysisOutput | null>(null)
  const [streamOutput, setStreamOutput] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)

  const streamContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (streamContainerRef.current) {
      streamContainerRef.current.scrollTop = streamContainerRef.current.scrollHeight
    }
  }, [streamOutput])

  const onToken = useCallback(
    (token: string) => {
      setStreamOutput((prev) => prev + token)
      dispatch({ type: 'TOKEN' })
    },
    [dispatch],
  )

  const onComplete = useCallback(
    (output: AnalysisOutput) => {
      setAnalysisOutput(output)
      dispatch({ type: 'COMPLETE' })
    },
    [dispatch],
  )

  const onError = useCallback(
    (detail: string) => {
      dispatch({ type: 'ERROR', detail })
    },
    [dispatch],
  )

  useAnalysisStream(jobId, onToken, onComplete, onError)

  const handleSubmitStart = useCallback(() => {
    dispatch({ type: 'SUBMIT' })
  }, [dispatch])

  const handleUploadComplete = useCallback(
    (result: UploadResult) => {
      setCacheId(result.cacheId)
      setRedactionSummary(result.redactionSummary)
      dispatch({ type: 'FETCH_COMPLETE' })
      dispatch({ type: 'SCRUB_COMPLETE' })
    },
    [dispatch],
  )

  const handleConfirm = useCallback(async () => {
    if (!cacheId || isConfirming) return
    setIsConfirming(true)
    try {
      const { jobId: newJobId } = await postAnalysisJob(cacheId)
      setJobId(newJobId)
      dispatch({ type: 'REVIEW_CONFIRMED' })
    } catch (ex) {
      const err = ex as { message?: string }
      dispatch({ type: 'ERROR', detail: err.message ?? 'Failed to start analysis' })
    } finally {
      setIsConfirming(false)
    }
  }, [cacheId, isConfirming, dispatch])

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CANCEL' })
  }, [dispatch])

  const handleReset = useCallback(() => {
    setCacheId(null)
    setJobId(null)
    setRedactionSummary([])
    setAnalysisOutput(null)
    setStreamOutput('')
    dispatch({ type: 'RESET' })
  }, [dispatch])

  const handleUploadError = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [dispatch])

  if (store.state === 'idle') {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-zinc-900">Analyze Logs</h1>

        {/* Log source selector */}
        <div role="tablist" aria-label="Log source" className="flex gap-2">
          <button
            role="tab"
            type="button"
            aria-selected="true"
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-teal-600 text-white"
          >
            Upload File
          </button>
          <button
            role="tab"
            type="button"
            aria-selected="false"
            aria-disabled="true"
            disabled
            className="text-sm font-medium px-3 py-1.5 rounded-md text-zinc-400 bg-zinc-100 cursor-not-allowed flex items-center gap-1.5"
          >
            Loki Query
            <span className="text-xs font-normal bg-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded">Post-MVP</span>
          </button>
        </div>

        <FileUpload
          onSubmitStart={handleSubmitStart}
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Analyze Logs</h1>

      <PipelineProgress store={store} />

      {store.state === 'awaiting-review' && (
        <RedactionReviewPanel
          redactionSummary={redactionSummary}
          onConfirm={() => void handleConfirm()}
          onCancel={handleReset}
          disabled={isConfirming}
        />
      )}

      {(store.state === 'analysing' ||
        store.state === 'streaming' ||
        store.state === 'cancelled') && (
        <CancelButton
          jobId={jobId}
          store={store}
          onCancel={store.state === 'cancelled' ? handleReset : handleCancel}
        />
      )}

      {store.state === 'complete' && (
        <div className="pt-4 border-t border-zinc-100">
          <button
            type="button"
            onClick={handleReset}
            className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors duration-150 cursor-pointer"
          >
            Start new analysis
          </button>
        </div>
      )}

      {(store.state === 'streaming' || store.state === 'complete') && streamOutput && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Raw output</p>
          <div
            ref={streamContainerRef}
            role="region"
            aria-live="polite"
            aria-label="Analysis output"
            tabIndex={0}
            className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4"
          >
            <pre className="font-mono text-sm leading-snug whitespace-pre-wrap text-zinc-800">{streamOutput}</pre>
          </div>
        </div>
      )}

      {store.state === 'complete' && analysisOutput && (
        <div data-testid="analysis-output">
          <AnalysisOutputComponent output={analysisOutput} />
        </div>
      )}

      {store.state === 'error' && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 space-y-3"
        >
          <p className="text-sm text-red-700 font-medium">
            {store.errorDetail ?? 'An error occurred during analysis.'}
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-red-600 hover:text-red-800 underline underline-offset-2 cursor-pointer transition-colors duration-150"
          >
            Start new analysis
          </button>
        </div>
      )}
    </div>
  )
}
