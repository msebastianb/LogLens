/**
 * useAnalysisPipeline — state machine hook for the log analysis pipeline.
 *
 * Implements explicit named states with a pure reducer — no boolean `isLoading`
 * flags. `completedStages` accumulates previously-visited active stages so the
 * progress indicator can mark them done independently of current state.
 * `errorStage` captures which stage was active when the error occurred so the
 * progress indicator can highlight the failing row.
 *
 * State flow (happy path):
 *   idle → fetching → scrubbing → awaiting-review → analysing → streaming → complete
 *
 * [Source: architecture.md#pipeline-state-machine, story-5.1, AC1–AC6]
 */
import { useReducer } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineState =
  | 'idle'
  | 'fetching'
  | 'scrubbing'
  | 'awaiting-review'
  | 'analysing'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'cancelled'

export type PipelineAction =
  | { type: 'SUBMIT' }
  | { type: 'FETCH_COMPLETE' }
  | { type: 'SCRUB_COMPLETE' }
  | { type: 'REVIEW_CONFIRMED' }
  | { type: 'TOKEN' }
  | { type: 'COMPLETE' }
  | { type: 'ERROR'; detail: string }
  | { type: 'CANCEL' }
  | { type: 'RESET' }

export interface PipelineStore {
  state: PipelineState
  completedStages: PipelineState[]
  errorDetail: string | null
  /** The active stage that was running when the error occurred — used for UI highlighting. */
  errorStage: PipelineState | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVE_STATES: PipelineState[] = [
  'fetching',
  'scrubbing',
  'awaiting-review',
  'analysing',
  'streaming',
]

export const initialStore: PipelineStore = {
  state: 'idle',
  completedStages: [],
  errorDetail: null,
  errorStage: null,
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function pipelineReducer(store: PipelineStore, action: PipelineAction): PipelineStore {
  switch (action.type) {
    case 'SUBMIT':
      return store.state === 'idle' ? { ...store, state: 'fetching' } : store

    case 'FETCH_COMPLETE':
      return store.state === 'fetching'
        ? { ...store, state: 'scrubbing', completedStages: [...store.completedStages, 'fetching'] }
        : store

    case 'SCRUB_COMPLETE':
      return store.state === 'scrubbing'
        ? {
            ...store,
            state: 'awaiting-review',
            completedStages: [...store.completedStages, 'scrubbing'],
          }
        : store

    case 'REVIEW_CONFIRMED':
      return store.state === 'awaiting-review'
        ? {
            ...store,
            state: 'analysing',
            completedStages: [...store.completedStages, 'awaiting-review'],
          }
        : store

    case 'TOKEN':
      // No-op if already streaming — prevents duplicate completedStages entry
      return store.state === 'analysing'
        ? {
            ...store,
            state: 'streaming',
            completedStages: [...store.completedStages, 'analysing'],
          }
        : store

    case 'COMPLETE':
      return store.state === 'streaming'
        ? {
            ...store,
            state: 'complete',
            completedStages: [...store.completedStages, 'streaming'],
          }
        : store

    case 'ERROR':
      return ACTIVE_STATES.includes(store.state)
        ? {
            ...store,
            state: 'error',
            errorDetail: action.detail,
            errorStage: store.state,
          }
        : store

    case 'CANCEL':
      return ACTIVE_STATES.includes(store.state) ? { ...store, state: 'cancelled' } : store

    case 'RESET':
      return initialStore

    default:
      return store
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAnalysisPipeline() {
  return useReducer(pipelineReducer, initialStore)
}
