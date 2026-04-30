/**
 * Unit tests for useAnalysisStream hook.
 *
 * EventSource is not available in jsdom — mocked via vi.stubGlobal.
 * MockEventSource stores the latest instance so tests can dispatch events.
 *
 * [Source: story-5.3, AC3]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { render } from '@testing-library/react'
import { useAnalysisStream } from './useAnalysisStream.js'
import PipelineProgress from './PipelineProgress.js'
import { initialStore } from './useAnalysisPipeline.js'
import type { AnalysisOutput } from './analysisApi.js'

// ─── Mock EventSource ─────────────────────────────────────────────────────────

class MockEventSource {
  static instance: MockEventSource | null = null
  listeners: Record<string, Array<(e: MessageEvent) => void>> = {}
  close = vi.fn()

  constructor(
    public url: string,
    public opts?: EventSourceInit,
  ) {
    MockEventSource.instance = this
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), handler]
  }

  dispatch(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent
    this.listeners[type]?.forEach(h => h(event))
  }
}

vi.stubGlobal('EventSource', MockEventSource)

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const validOutput: AnalysisOutput = {
  errors: [{ type: 'NullPointerException', count: 2, distribution: 'clustered' }],
  anomalies: ['Spike at 03:00 UTC'],
  rootCause: { hypothesis: 'Memory leak', confidence: 'High', evidenceExcerpts: ['line 42'] },
  timeline: [{ timestamp: '2024-01-01T03:00:00Z', component: 'api', event: 'OOM' }],
  nextSteps: ['Increase heap'],
}

describe('useAnalysisStream', () => {
  beforeEach(() => {
    MockEventSource.instance = null
    vi.clearAllMocks()
  })

  it('opens EventSource with correct URL and withCredentials when jobId is provided', () => {
    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    renderHook(() => useAnalysisStream('job-abc', onToken, onComplete, onError))

    expect(MockEventSource.instance).not.toBeNull()
    expect(MockEventSource.instance!.url).toBe('/api/v1/analysis-jobs/job-abc/stream')
    expect(MockEventSource.instance!.opts?.withCredentials).toBe(true)
  })

  it('does not open EventSource when jobId is null', () => {
    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    renderHook(() => useAnalysisStream(null, onToken, onComplete, onError))

    expect(MockEventSource.instance).toBeNull()
  })

  it('appends token to outputRef and calls onToken without triggering PipelineProgress re-render', () => {
    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    // Render PipelineProgress alongside — track renders via a spy component
    let progressRenderCount = 0
    function SpyProgress() {
      progressRenderCount++
      return <PipelineProgress store={{ ...initialStore, state: 'streaming' }} />
    }

    // Mount a component that uses the hook
    function TestComponent() {
      const { outputRef } = useAnalysisStream('job-abc', onToken, onComplete, onError)
      return (
        <>
          <span data-testid="output">{outputRef.current}</span>
          <SpyProgress />
        </>
      )
    }

    render(<TestComponent />)
    const rendersBefore = progressRenderCount

    act(() => {
      MockEventSource.instance!.dispatch('token', { text: 'hello' })
      MockEventSource.instance!.dispatch('token', { text: ' world' })
    })

    // onToken called twice
    expect(onToken).toHaveBeenCalledTimes(2)
    expect(onToken).toHaveBeenCalledWith('hello')
    expect(onToken).toHaveBeenCalledWith(' world')

    // PipelineProgress did NOT re-render due to token arrival
    expect(progressRenderCount).toBe(rendersBefore)
  })

  it('calls onComplete with parsed AnalysisOutput when event: complete arrives', () => {
    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    renderHook(() => useAnalysisStream('job-abc', onToken, onComplete, onError))

    act(() => {
      MockEventSource.instance!.dispatch('complete', validOutput)
    })

    expect(onComplete).toHaveBeenCalledWith(validOutput)
    expect(MockEventSource.instance!.close).toHaveBeenCalled()
  })

  it('calls onError with message when event: error arrives', () => {
    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    renderHook(() => useAnalysisStream('job-abc', onToken, onComplete, onError))

    act(() => {
      MockEventSource.instance!.dispatch('error', { message: 'LLM stream failed' })
    })

    expect(onError).toHaveBeenCalledWith('LLM stream failed')
    expect(MockEventSource.instance!.close).toHaveBeenCalled()
  })

  it('falls back to "Stream error" when error payload has no message field', () => {
    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    renderHook(() => useAnalysisStream('job-abc', onToken, onComplete, onError))

    act(() => {
      MockEventSource.instance!.dispatch('error', {})
    })

    expect(onError).toHaveBeenCalledWith('Stream error')
  })

  it('closes EventSource on unmount', () => {
    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    const { unmount } = renderHook(() =>
      useAnalysisStream('job-abc', onToken, onComplete, onError),
    )

    const es = MockEventSource.instance!
    unmount()

    expect(es.close).toHaveBeenCalled()
  })

  it('resets outputRef and opens new EventSource when jobId changes', () => {
    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    const { rerender } = renderHook(
      ({ jobId }: { jobId: string | null }) =>
        useAnalysisStream(jobId, onToken, onComplete, onError),
      { initialProps: { jobId: 'job-1' as string | null } },
    )

    const firstEs = MockEventSource.instance!
    act(() => {
      firstEs.dispatch('token', { text: 'partial' })
    })

    // Change jobId — should close old, open new
    rerender({ jobId: 'job-2' })

    expect(firstEs.close).toHaveBeenCalled()
    expect(MockEventSource.instance!.url).toBe('/api/v1/analysis-jobs/job-2/stream')
  })
})
