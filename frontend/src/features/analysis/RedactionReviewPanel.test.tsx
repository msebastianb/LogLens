/**
 * Unit tests for RedactionReviewPanel component.
 *
 * [Source: story-5.5, task 6, AC2, AC7]
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RedactionReviewPanel from './RedactionReviewPanel.js'

describe('RedactionReviewPanel', () => {
  it('shows "No sensitive content detected in this log." when redactionSummary is empty', () => {
    render(<RedactionReviewPanel redactionSummary={[]} onConfirm={vi.fn()} />)
    expect(screen.getByText(/no sensitive content detected in this log/i)).toBeInTheDocument()
  })

  it('shows "Review before analysis" heading', () => {
    render(<RedactionReviewPanel redactionSummary={[]} onConfirm={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /review before analysis/i })).toBeInTheDocument()
  })

  it('groups redactions by type and shows counts for non-empty summary', () => {
    const summary = [
      { type: 'PERSON', start: 0, end: 5 },
      { type: 'PERSON', start: 10, end: 15 },
      { type: 'API_KEY', start: 20, end: 30 },
    ]
    render(<RedactionReviewPanel redactionSummary={summary} onConfirm={vi.fn()} />)
    expect(screen.getByText(/person.*2 removed/i)).toBeInTheDocument()
    expect(screen.getByText(/api_key.*1 removed/i)).toBeInTheDocument()
  })

  it('"Confirm and analyze" button is present and calls onConfirm when clicked', () => {
    const onConfirm = vi.fn()
    render(<RedactionReviewPanel redactionSummary={[]} onConfirm={onConfirm} />)
    const btn = screen.getByRole('button', { name: /confirm and analyze/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('"Cancel and start over" button calls onCancel when clicked', () => {
    const onCancel = vi.fn()
    render(<RedactionReviewPanel redactionSummary={[]} onConfirm={vi.fn()} onCancel={onCancel} />)
    const btn = screen.getByRole('button', { name: /cancel and start over/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
