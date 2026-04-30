/**
 * Unit tests for AnalysisView orchestration component.
 *
 * Mocks: FileUpload (to control callbacks), useAnalysisStream (no EventSource),
 *        analysisApi.postAnalysisJob (no network)
 *
 * [Source: story-5.5, task 7, AC1–AC6]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AnalysisView from './AnalysisView.js'

// ─── Mock FileUpload to expose callback triggers ──────────────────────────────

vi.mock('./FileUpload.js', () => ({
  default: ({
    onSubmitStart,
    onUploadComplete,
  }: {
    onSubmitStart?: () => void
    onUploadComplete?: (result: {
      cacheId: string
      lineCount: number
      redactionSummary: Array<{ type: string; start: number; end: number }>
    }) => void
  }) => (
    <div>
      <p>Upload form</p>
      {/* Fires only SUBMIT — used to test that FileUpload disappears */}
      <button onClick={onSubmitStart}>trigger-submit-start</button>
      {/* Fires both SUBMIT + upload complete in one click (React 18 batches) */}
      <button
        onClick={() => {
          onSubmitStart?.()
          onUploadComplete?.({
            cacheId: 'cache-123',
            lineCount: 5,
            redactionSummary: [{ type: 'PERSON', start: 0, end: 5 }],
          })
        }}
      >
        trigger-full-upload
      </button>
    </div>
  ),
}))

// ─── Mock useAnalysisStream (no EventSource in jsdom) ────────────────────────

let capturedOnToken: ((token: string) => void) | null = null
let capturedOnComplete: ((output: unknown) => void) | null = null

vi.mock('./useAnalysisStream.js', () => ({
  useAnalysisStream: (
    _jobId: string | null,
    onToken: (token: string) => void,
    onComplete: (output: unknown) => void,
  ) => {
    capturedOnToken = onToken
    capturedOnComplete = onComplete
    return { outputRef: { current: '' } }
  },
}))

// ─── Mock apiClient (CancelButton fetches CSRF token) ────────────────────────

const { mockApiGet } = vi.hoisted(() => ({ mockApiGet: vi.fn() }))
vi.mock('../../lib/apiClient.js', () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── Mock postAnalysisJob ─────────────────────────────────────────────────────

const { mockPostAnalysisJob } = vi.hoisted(() => ({
  mockPostAnalysisJob: vi.fn<() => Promise<{ jobId: string }>>(),
}))

vi.mock('./analysisApi.js', () => ({
  postAnalysisJob: mockPostAnalysisJob,
  uploadLogFile: vi.fn(),
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AnalysisView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnToken = null
    capturedOnComplete = null
    mockPostAnalysisJob.mockResolvedValue({ jobId: 'job-abc' })
    mockApiGet.mockResolvedValue({ token: 'csrf-tok' })
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('AC1: renders FileUpload when pipeline is idle', () => {
    render(<AnalysisView />)
    expect(screen.getByText(/upload form/i)).toBeInTheDocument()
  })

  it('AC1: does not render PipelineProgress when pipeline is idle', () => {
    render(<AnalysisView />)
    // PipelineProgress returns null for idle state
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('AC2: renders PipelineProgress and RedactionReviewPanel after upload completes', async () => {
    const user = userEvent.setup()
    render(<AnalysisView />)

    await user.click(screen.getByText('trigger-full-upload'))

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByRole('region', { name: /redaction review/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /confirm and analyze/i })).toBeInTheDocument()
    })
  })

  it('AC2: FileUpload is gone once pipeline leaves idle', async () => {
    const user = userEvent.setup()
    render(<AnalysisView />)

    await user.click(screen.getByText('trigger-submit-start'))

    await waitFor(() => {
      expect(screen.queryByText(/upload form/i)).not.toBeInTheDocument()
    })
  })

  it('AC3: clicking "Confirm and analyze" calls postAnalysisJob with cacheId', async () => {
    const user = userEvent.setup()
    render(<AnalysisView />)

    await user.click(screen.getByText('trigger-full-upload'))
    await user.click(await screen.findByRole('button', { name: /confirm and analyze/i }))

    await waitFor(() => {
      expect(mockPostAnalysisJob).toHaveBeenCalledWith('cache-123')
    })
  })

  it('AC4: Cancel button appears after analysis job is confirmed', async () => {
    const user = userEvent.setup()
    render(<AnalysisView />)

    await user.click(screen.getByText('trigger-full-upload'))
    await user.click(await screen.findByRole('button', { name: /confirm and analyze/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel analysis/i })).toBeInTheDocument()
    })
  })

  it('AC6: "Start New Analysis" after cancellation resets pipeline to idle', async () => {
    const user = userEvent.setup()
    render(<AnalysisView />)

    await user.click(screen.getByText('trigger-full-upload'))
    await user.click(await screen.findByRole('button', { name: /confirm and analyze/i }))

    // Click Cancel
    const cancelBtn = await screen.findByRole('button', { name: /cancel analysis/i })
    await user.click(cancelBtn)

    // "Start New Analysis" should appear (from CancelButton in cancelled state)
    const startNewBtn = await screen.findByRole('button', { name: /start new analysis/i })
    await user.click(startNewBtn)

    // Should be back to idle — FileUpload visible
    await waitFor(() => {
      expect(screen.getByText(/upload form/i)).toBeInTheDocument()
    })
  })

  it('AC5+AC6: pipeline reaches complete state and "Start New Analysis" resets to idle', async () => {
    const user = userEvent.setup()
    const { act } = await import('@testing-library/react')
    render(<AnalysisView />)

    // Drive to analysing
    await user.click(screen.getByText('trigger-full-upload'))
    await user.click(await screen.findByRole('button', { name: /confirm and analyze/i }))
    await waitFor(() => expect(mockPostAnalysisJob).toHaveBeenCalled())

    // Fire a token to transition analysing → streaming
    await waitFor(() => expect(capturedOnToken).not.toBeNull())
    await act(async () => { capturedOnToken!('some token') })

    // Fire complete to transition streaming → complete
    const mockOutput = {
      errors: [],
      anomalies: [],
      rootCause: { hypothesis: 'test', confidence: 'Low' as const, evidenceExcerpts: [] },
      timeline: [],
      nextSteps: [],
    }
    await act(async () => { capturedOnComplete!(mockOutput) })

    // Pipeline should be complete — "Start New Analysis" button visible
    const startBtn = await screen.findByRole('button', { name: /start new analysis/i })
    await user.click(startBtn)

    // Should be back to idle — FileUpload visible
    await waitFor(() => {
      expect(screen.getByText(/upload form/i)).toBeInTheDocument()
    })
  })

  it('AC streaming: live stream container renders streamOutput text in streaming state', async () => {
    const { act } = await import('@testing-library/react')
    const user = userEvent.setup()
    render(<AnalysisView />)
    await user.click(screen.getByText('trigger-full-upload'))
    await user.click(screen.getByRole('button', { name: /confirm and analyze/i }))
    await waitFor(() => expect(mockPostAnalysisJob).toHaveBeenCalled())
    await act(async () => { capturedOnToken?.('Hello') })
    await act(async () => { capturedOnToken?.(' world') })
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('AC complete: "Start new analysis" button is visible in complete state', async () => {
    const { act } = await import('@testing-library/react')
    const user = userEvent.setup()
    render(<AnalysisView />)
    await user.click(screen.getByText('trigger-full-upload'))
    await user.click(screen.getByRole('button', { name: /confirm and analyze/i }))
    await waitFor(() => expect(mockPostAnalysisJob).toHaveBeenCalled())
    await act(async () => { capturedOnToken?.('token') })
    await act(async () => {
      capturedOnComplete?.({
        errors: [], anomalies: [], rootCause: { hypothesis: 'h', confidence: 'high', evidenceExcerpts: [] },
        timeline: [], nextSteps: [],
      })
    })
    expect(screen.getByRole('button', { name: /start new analysis/i })).toBeInTheDocument()
  })

  it('AC complete: clicking "Start new analysis" resets pipeline to idle', async () => {
    const { act } = await import('@testing-library/react')
    const user = userEvent.setup()
    render(<AnalysisView />)
    await user.click(screen.getByText('trigger-full-upload'))
    await user.click(screen.getByRole('button', { name: /confirm and analyze/i }))
    await waitFor(() => expect(mockPostAnalysisJob).toHaveBeenCalled())
    await act(async () => { capturedOnToken?.('token') })
    await act(async () => {
      capturedOnComplete?.({
        errors: [], anomalies: [], rootCause: { hypothesis: 'h', confidence: 'high', evidenceExcerpts: [] },
        timeline: [], nextSteps: [],
      })
    })
    await user.click(screen.getByRole('button', { name: /start new analysis/i }))
    expect(screen.getByText('Upload form')).toBeInTheDocument()
  })
})
