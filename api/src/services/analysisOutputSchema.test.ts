import { describe, expect, it } from 'vitest'
import { AnalysisOutputSchema, parseAnalysisJson } from './analysisOutputSchema.js'

const validPayload = {
  errors: [{ type: 'NullPointerException', count: 3, distribution: 'evenly spread' }],
  anomalies: ['Spike at 03:00 UTC'],
  rootCause: {
    hypothesis: 'Memory leak in auth service',
    confidence: 'High' as const,
    evidenceExcerpts: ['OOM at line 42'],
  },
  timeline: [{ timestamp: '2024-01-01T03:00:00Z', component: 'auth', event: 'OOM kill' }],
  nextSteps: ['Increase heap size', 'Enable GC logging'],
}

describe('AnalysisOutputSchema', () => {
  it('accepts a valid complete payload', () => {
    const result = AnalysisOutputSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it('rejects missing errors field', () => {
    const { errors: _errors, ...rest } = validPayload
    const result = AnalysisOutputSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing anomalies field', () => {
    const { anomalies: _anomalies, ...rest } = validPayload
    const result = AnalysisOutputSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing rootCause field', () => {
    const { rootCause: _rootCause, ...rest } = validPayload
    const result = AnalysisOutputSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing timeline field', () => {
    const { timeline: _timeline, ...rest } = validPayload
    const result = AnalysisOutputSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects nextSteps as empty array', () => {
    const result = AnalysisOutputSchema.safeParse({ ...validPayload, nextSteps: [] })
    expect(result.success).toBe(false)
  })
})

describe('parseAnalysisJson', () => {
  it('strips ```json markdown fences before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(validPayload) + '\n```'
    const output = parseAnalysisJson(fenced)
    expect(output.rootCause.hypothesis).toBe('Memory leak in auth service')
  })

  it('throws on non-JSON input', () => {
    expect(() => parseAnalysisJson('not json at all')).toThrow('LLM response is not valid JSON')
  })
})
