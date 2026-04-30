import { describe, it, expect } from 'vitest'
import { pipelineReducer, initialStore } from './useAnalysisPipeline.js'
import type { PipelineStore } from './useAnalysisPipeline.js'

// Convenience: apply a sequence of action types to an initial store
function apply(store: PipelineStore, ...types: Parameters<typeof pipelineReducer>[1][]): PipelineStore {
  return types.reduce((s, a) => pipelineReducer(s, a), store)
}

describe('pipelineReducer', () => {
  it('SUBMIT transitions idle → fetching', () => {
    const next = pipelineReducer(initialStore, { type: 'SUBMIT' })
    expect(next.state).toBe('fetching')
    expect(next.completedStages).toEqual([])
  })

  it('FETCH_COMPLETE transitions fetching → scrubbing; adds fetching to completedStages', () => {
    const store = apply(initialStore, { type: 'SUBMIT' })
    const next = pipelineReducer(store, { type: 'FETCH_COMPLETE' })
    expect(next.state).toBe('scrubbing')
    expect(next.completedStages).toContain('fetching')
  })

  it('SCRUB_COMPLETE transitions scrubbing → awaiting-review; adds scrubbing to completedStages', () => {
    const store = apply(initialStore, { type: 'SUBMIT' }, { type: 'FETCH_COMPLETE' })
    const next = pipelineReducer(store, { type: 'SCRUB_COMPLETE' })
    expect(next.state).toBe('awaiting-review')
    expect(next.completedStages).toContain('scrubbing')
  })

  it('REVIEW_CONFIRMED transitions awaiting-review → analysing; adds awaiting-review to completedStages', () => {
    const store = apply(
      initialStore,
      { type: 'SUBMIT' },
      { type: 'FETCH_COMPLETE' },
      { type: 'SCRUB_COMPLETE' },
    )
    const next = pipelineReducer(store, { type: 'REVIEW_CONFIRMED' })
    expect(next.state).toBe('analysing')
    expect(next.completedStages).toContain('awaiting-review')
  })

  it('TOKEN transitions analysing → streaming; adds analysing to completedStages', () => {
    const store = apply(
      initialStore,
      { type: 'SUBMIT' },
      { type: 'FETCH_COMPLETE' },
      { type: 'SCRUB_COMPLETE' },
      { type: 'REVIEW_CONFIRMED' },
    )
    const next = pipelineReducer(store, { type: 'TOKEN' })
    expect(next.state).toBe('streaming')
    expect(next.completedStages).toContain('analysing')
  })

  it('second TOKEN in streaming state is a no-op — no duplicate in completedStages', () => {
    const store = apply(
      initialStore,
      { type: 'SUBMIT' },
      { type: 'FETCH_COMPLETE' },
      { type: 'SCRUB_COMPLETE' },
      { type: 'REVIEW_CONFIRMED' },
      { type: 'TOKEN' },
    )
    const next = pipelineReducer(store, { type: 'TOKEN' })
    expect(next.state).toBe('streaming')
    expect(next.completedStages.filter(s => s === 'analysing')).toHaveLength(1)
  })

  it('COMPLETE transitions streaming → complete; adds streaming to completedStages', () => {
    const store = apply(
      initialStore,
      { type: 'SUBMIT' },
      { type: 'FETCH_COMPLETE' },
      { type: 'SCRUB_COMPLETE' },
      { type: 'REVIEW_CONFIRMED' },
      { type: 'TOKEN' },
    )
    const next = pipelineReducer(store, { type: 'COMPLETE' })
    expect(next.state).toBe('complete')
    expect(next.completedStages).toContain('streaming')
  })

  it('ERROR from active state → error; completedStages preserved; errorDetail and errorStage set', () => {
    const store = apply(initialStore, { type: 'SUBMIT' }, { type: 'FETCH_COMPLETE' })
    // currently scrubbing with fetching in completedStages
    const next = pipelineReducer(store, { type: 'ERROR', detail: 'Scrubber timeout' })
    expect(next.state).toBe('error')
    expect(next.completedStages).toContain('fetching')
    expect(next.errorDetail).toBe('Scrubber timeout')
    expect(next.errorStage).toBe('scrubbing')
  })

  it('CANCEL from active state → cancelled', () => {
    const store = apply(initialStore, { type: 'SUBMIT' }, { type: 'FETCH_COMPLETE' })
    const next = pipelineReducer(store, { type: 'CANCEL' })
    expect(next.state).toBe('cancelled')
  })

  it('CANCEL from idle is a no-op', () => {
    const next = pipelineReducer(initialStore, { type: 'CANCEL' })
    expect(next.state).toBe('idle')
  })

  it('RESET from any state returns initial store', () => {
    const store = apply(initialStore, { type: 'SUBMIT' }, { type: 'FETCH_COMPLETE' })
    const next = pipelineReducer(store, { type: 'RESET' })
    expect(next).toEqual(initialStore)
  })
})
