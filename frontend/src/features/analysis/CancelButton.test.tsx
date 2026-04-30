/**
 * Unit tests for CancelButton component.
 *
 * [Source: story-5.2, AC1, AC3, AC4]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CancelButton } from './CancelButton.js'
import type { PipelineStore } from './useAnalysisPipeline.js'
import { initialStore } from './useAnalysisPipeline.js'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}))
vi.mock('../../lib/apiClient.js', () => ({
  apiGet: mockApiGet,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStore(overrides: Partial<PipelineStore> = {}): PipelineStore {
  return { ...initialStore, ...overrides }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CancelButton', () => {
  const onCancel = vi.fn()
  const jobId = 'job-abc'

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ token: 'csrf-tok' })
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('does not render when state is idle', () => {
    const { container } = render(
      <CancelButton jobId={jobId} store={makeStore({ state: 'idle' })} onCancel={onCancel} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('does not render when state is awaiting-review', () => {
    const { container } = render(
      <CancelButton
        jobId={jobId}
        store={makeStore({ state: 'awaiting-review' })}
        onCancel={onCancel}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('does not render when state is complete', () => {
    const { container } = render(
      <CancelButton jobId={jobId} store={makeStore({ state: 'complete' })} onCancel={onCancel} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders "Cancel" button when state is fetching', () => {
    render(
      <CancelButton jobId={jobId} store={makeStore({ state: 'fetching' })} onCancel={onCancel} />,
    )
    expect(screen.getByRole('button', { name: 'Cancel analysis' })).toBeInTheDocument()
  })

  it('renders "Cancel analysis" button when state is analysing', () => {
    render(
      <CancelButton
        jobId={jobId}
        store={makeStore({ state: 'analysing' })}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cancel analysis' })).toBeInTheDocument()
  })

  it('clicking "Cancel analysis" calls fetch DELETE with CSRF token then calls onCancel', async () => {
    render(
      <CancelButton jobId={jobId} store={makeStore({ state: 'streaming' })} onCancel={onCancel} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel analysis' }))
    expect(mockApiGet).toHaveBeenCalledWith('/api/v1/csrf/token')
    expect(mockFetch).toHaveBeenCalledWith(`/api/v1/analysis-jobs/${jobId}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': 'csrf-tok' },
      credentials: 'include',
    })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('clicking "Cancel analysis" still calls onCancel when jobId is null (fetching/scrubbing state)', async () => {
    render(
      <CancelButton jobId={null} store={makeStore({ state: 'fetching' })} onCancel={onCancel} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel analysis' }))
    expect(mockFetch).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('renders "Start New Analysis" button when state is cancelled', () => {
    render(
      <CancelButton
        jobId={jobId}
        store={makeStore({ state: 'cancelled' })}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByRole('button', { name: 'Start new analysis' })).toBeInTheDocument()
  })

  it('clicking "Start new analysis" calls onCancel', async () => {
    render(
      <CancelButton
        jobId={jobId}
        store={makeStore({ state: 'cancelled' })}
        onCancel={onCancel}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Start new analysis' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
