/**
 * Unit tests for logFileParser.
 *
 * Verifies all parse paths (log, json, ndjson) and error handling.
 * No mocks needed — pure functions.
 * [Source: story-2.4, task 4, AC3]
 */
import { describe, it, expect } from 'vitest'
import {
  parseLogText,
  parseJsonLog,
  parseNdjsonLog,
  parseLogFile,
  ParseError,
} from './logFileParser.js'

// ─── parseLogText ─────────────────────────────────────────────────────────────

describe('parseLogText', () => {
  it('splits content on newlines and strips empty lines', () => {
    const result = parseLogText('line one\nline two\n\nline three\n')
    expect(result).toEqual(['line one', 'line two', 'line three'])
  })

  it('returns empty array for blank content', () => {
    expect(parseLogText('\n\n  \n')).toEqual([])
  })

  it('preserves leading spaces (only trailing stripped)', () => {
    const result = parseLogText('  indented  \nnormal')
    expect(result).toEqual(['  indented', 'normal'])
  })
})

// ─── parseJsonLog ─────────────────────────────────────────────────────────────

describe('parseJsonLog', () => {
  it('returns stringified entries for a valid JSON array of objects', () => {
    const content = JSON.stringify([{ level: 'info', msg: 'hello' }])
    const result = parseJsonLog(content)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(JSON.stringify({ level: 'info', msg: 'hello' }))
  })

  it('passes through string entries unchanged', () => {
    const content = JSON.stringify(['line one', 'line two'])
    expect(parseJsonLog(content)).toEqual(['line one', 'line two'])
  })

  it('throws ParseError for invalid JSON', () => {
    expect(() => parseJsonLog('not json')).toThrow(ParseError)
  })

  it('throws ParseError when root is not an array', () => {
    expect(() => parseJsonLog('{"a":1}')).toThrow(ParseError)
  })
})

// ─── parseNdjsonLog ───────────────────────────────────────────────────────────

describe('parseNdjsonLog', () => {
  it('parses each line as independent JSON', () => {
    const content = '{"a":1}\n{"b":2}\n'
    const result = parseNdjsonLog(content)
    expect(result).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('skips blank lines', () => {
    const content = '{"a":1}\n\n{"b":2}'
    expect(parseNdjsonLog(content)).toHaveLength(2)
  })

  it('throws ParseError with lineNumber for malformed line', () => {
    const content = '{"a":1}\nbad json\n{"c":3}'
    let err: ParseError | undefined
    try {
      parseNdjsonLog(content)
    } catch (e) {
      err = e as ParseError
    }
    expect(err).toBeInstanceOf(ParseError)
    expect(err?.lineNumber).toBe(2)
  })
})

// ─── parseLogFile (dispatch) ──────────────────────────────────────────────────

describe('parseLogFile', () => {
  it('dispatches .log extension to parseLogText', () => {
    expect(parseLogFile('server.log', 'line1\nline2\n')).toEqual(['line1', 'line2'])
  })

  it('dispatches .json extension to parseJsonLog', () => {
    expect(parseLogFile('output.json', '["a","b"]')).toEqual(['a', 'b'])
  })

  it('dispatches .ndjson extension to parseNdjsonLog', () => {
    expect(parseLogFile('events.ndjson', '"a"\n"b"')).toEqual(['a', 'b'])
  })

  it('throws ParseError for unsupported extension', () => {
    expect(() => parseLogFile('data.csv', 'a,b,c')).toThrow(ParseError)
  })

  it('is case-insensitive for extension matching', () => {
    expect(() => parseLogFile('DATA.CSV', '')).toThrow(ParseError)
    expect(parseLogFile('UPPER.LOG', 'hello')).toEqual(['hello'])
  })
})
