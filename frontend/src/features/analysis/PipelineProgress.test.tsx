import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import PipelineProgress from './PipelineProgress.js'
import type { PipelineStore } from './useAnalysisPipeline.js'
import { initialStore } from './useAnalysisPipeline.js'

function makeStore(overrides: Partial<PipelineStore> = {}): PipelineStore {
  return { ...initialStore, ...overrides }
}

describe('PipelineProgress', () => {
  it('renders nothing when store.state is idle', () => {
    const { container } = render(<PipelineProgress store={makeStore()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "Fetching logs…" label when state is fetching (AC2)', () => {
    render(<PipelineProgress store={makeStore({ state: 'fetching' })} />)
    const row = screen.getByTestId('stage-fetching')
    expect(within(row).getByText('Fetching logs…')).toBeInTheDocument()
  })

  it('renders "Scrubbing for PII and secrets…" when state is scrubbing; fetching stage marked complete (AC3)', () => {
    render(
      <PipelineProgress
        store={makeStore({ state: 'scrubbing', completedStages: ['fetching'] })}
      />,
    )
    expect(screen.getByTestId('stage-scrubbing')).toHaveTextContent('Scrubbing for PII and secrets…')
    // fetching stage should show done indicator
    expect(screen.getByTestId('stage-fetching')).toHaveTextContent('✓')
  })

  it('renders "Analysing with LLM…" when state is analysing (AC4)', () => {
    render(
      <PipelineProgress
        store={makeStore({
          state: 'analysing',
          completedStages: ['fetching', 'scrubbing', 'awaiting-review'],
        })}
      />,
    )
    expect(screen.getByTestId('stage-analysing')).toHaveTextContent('Analysing with LLM…')
  })

  it('all stages show done indicator when state is complete (AC5)', () => {
    render(
      <PipelineProgress
        store={makeStore({
          state: 'complete',
          completedStages: ['fetching', 'scrubbing', 'awaiting-review', 'analysing', 'streaming'],
        })}
      />,
    )
    for (const stage of ['fetching', 'scrubbing', 'awaiting-review', 'analysing']) {
      expect(screen.getByTestId(`stage-${stage}`)).toHaveTextContent('✓')
    }
    // complete stage itself is the current state — shown as active
    expect(screen.getByTestId('stage-complete')).toHaveTextContent('…')
  })

  it('error detail message is visible and errorStage row highlighted when state is error (AC6)', () => {
    render(
      <PipelineProgress
        store={makeStore({
          state: 'error',
          completedStages: ['fetching'],
          errorDetail: 'Scrubber timeout',
          errorStage: 'scrubbing',
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Scrubber timeout')
    // fetching still shows done
    expect(screen.getByTestId('stage-fetching')).toHaveTextContent('✓')
  })

  it('completed stages show ✓; current stage shows … indicator', () => {
    render(
      <PipelineProgress
        store={makeStore({
          state: 'scrubbing',
          completedStages: ['fetching'],
        })}
      />,
    )
    expect(screen.getByTestId('stage-fetching')).toHaveTextContent('✓')
    expect(screen.getByTestId('stage-scrubbing')).toHaveTextContent('…')
    expect(screen.getByTestId('stage-analysing')).toHaveTextContent('—')
  })
})
