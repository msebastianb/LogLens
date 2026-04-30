import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import AnalysisOutput from './AnalysisOutput.js'
import type { AnalysisOutput as AnalysisOutputType } from './analysisApi.js'

const STUB_OUTPUT: AnalysisOutputType = {
  errors: [
    { type: 'NullPointerException', count: 12, distribution: 'UserService (8), OrderService (4)' },
    { type: 'TimeoutException', count: 3, distribution: 'PaymentService (3)' },
  ],
  anomalies: ['Spike in 5xx responses at 14:32 UTC'],
  rootCause: {
    hypothesis: 'Unhandled null in UserService.getById after cache miss',
    confidence: 'High',
    evidenceExcerpts: ['ERROR UserService.getById: Cannot read property id of null'],
  },
  timeline: [
    { timestamp: '2026-04-28T14:32:00Z', component: 'OrderService', event: '5xx spike begins' },
    { timestamp: '2026-04-28T14:30:00Z', component: 'UserService', event: 'Cache miss rate elevated' },
  ],
  nextSteps: ['Add null check in UserService.getById before cache lookup'],
}

describe('AnalysisOutput', () => {
  it('renders all four section headings (AC1)', () => {
    render(<AnalysisOutput output={STUB_OUTPUT} />)
    expect(screen.getByRole('heading', { name: /errors & frequency/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /anomalies/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /root cause hypothesis/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /event timeline/i })).toBeInTheDocument()
  })

  it('renders each error type, count, and distribution (AC2)', () => {
    render(<AnalysisOutput output={STUB_OUTPUT} />)
    expect(screen.getByText('NullPointerException')).toBeInTheDocument()
    expect(screen.getByText(/12×/)).toBeInTheDocument()
    expect(screen.getByText(/UserService \(8\), OrderService \(4\)/)).toBeInTheDocument()
    expect(screen.getByText('TimeoutException')).toBeInTheDocument()
    expect(screen.getByText(/3×/)).toBeInTheDocument()
  })

  it('renders confidence badge with correct value (AC3)', () => {
    render(<AnalysisOutput output={STUB_OUTPUT} />)
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('High')
  })

  it('renders confidence badge for Medium and Low values (AC3)', () => {
    const medium: AnalysisOutputType = {
      ...STUB_OUTPUT,
      rootCause: { ...STUB_OUTPUT.rootCause, confidence: 'Medium' },
    }
    const { rerender } = render(<AnalysisOutput output={medium} />)
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('Medium')

    const low: AnalysisOutputType = {
      ...STUB_OUTPUT,
      rootCause: { ...STUB_OUTPUT.rootCause, confidence: 'Low' },
    }
    rerender(<AnalysisOutput output={low} />)
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('Low')
  })

  it('renders timeline events in ascending timestamp order (AC4)', () => {
    render(<AnalysisOutput output={STUB_OUTPUT} />)
    const timelineSection = screen.getByRole('region', { name: /event timeline/i })
    const times = within(timelineSection).getAllByRole('time')
    // After sorting: 14:30 should come before 14:32
    expect(times[0]).toHaveTextContent('2026-04-28T14:30:00Z')
    expect(times[1]).toHaveTextContent('2026-04-28T14:32:00Z')
  })

  it('renders "AI-generated — not authoritative" banner (AC5/AC4)', () => {
    render(<AnalysisOutput output={STUB_OUTPUT} />)
    expect(screen.getByRole('alert')).toHaveTextContent('AI-generated — not authoritative')
  })

  it('banner has no dismiss button (AC4)', () => {
    render(<AnalysisOutput output={STUB_OUTPUT} />)
    const banner = screen.getByRole('alert')
    expect(within(banner).queryByRole('button')).toBeNull()
  })

  it('renders "Recommended Next Steps" ordered list (AC1)', () => {
    render(<AnalysisOutput output={STUB_OUTPUT} />)
    expect(screen.getByRole('heading', { name: /recommended next steps/i })).toBeInTheDocument()
    const section = screen.getByRole('region', { name: /recommended next steps/i })
    const list = section.querySelector('ol')
    expect(list).not.toBeNull()
  })

  it('renders each next-step item text (AC1)', () => {
    render(<AnalysisOutput output={STUB_OUTPUT} />)
    expect(
      screen.getByText('Add null check in UserService.getById before cache lookup'),
    ).toBeInTheDocument()
  })

  it('renders evidence excerpts in the root cause section (AC5)', () => {
    render(<AnalysisOutput output={STUB_OUTPUT} />)
    const rootCauseSection = screen.getByRole('region', { name: /root cause hypothesis/i })
    expect(
      within(rootCauseSection).getByText(
        'ERROR UserService.getById: Cannot read property id of null',
      ),
    ).toBeInTheDocument()
  })
})
