/**
 * Log file content parsers.
 *
 * Normalizes uploaded log files to an array of string lines.
 * Supported formats:
 *   .log  — raw text; split on newlines, strip blanks
 *   .json — must be an array; each element is stringified if not already a string
 *   .ndjson — newline-delimited JSON; each non-blank line is parsed independently
 *
 * All functions throw structured errors that the route handler converts to
 * RFC 7807 responses.
 * [Source: story-2.4, AC3]
 */

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly lineNumber?: number,
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

/**
 * Parse plain-text `.log` content into lines.
 * Empty lines are discarded.
 */
export function parseLogText(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
}

/**
 * Parse a `.json` file.
 * Content must be a JSON array; each element is coerced to a string.
 * Throws ParseError if the content is not valid JSON or not an array.
 */
export function parseJsonLog(content: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new ParseError('Invalid JSON: content is not valid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new ParseError('Invalid JSON: expected a top-level array of log entries')
  }
  return (parsed as unknown[]).map((entry, i) => {
    if (typeof entry === 'string') return entry
    if (entry !== null && typeof entry === 'object') return JSON.stringify(entry)
    throw new ParseError(`Invalid JSON: entry at index ${i} is not a string or object`)
  })
}

/**
 * Parse a `.ndjson` (newline-delimited JSON) file.
 * Each non-blank line must be valid JSON.
 * Throws ParseError with the 1-based line number on first malformed line.
 */
export function parseNdjsonLog(content: string): string[] {
  const lines = content.split('\n')
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      const parsed = JSON.parse(line)
      result.push(typeof parsed === 'string' ? parsed : JSON.stringify(parsed))
    } catch {
      throw new ParseError(`Invalid NDJSON: line ${i + 1} is not valid JSON`, i + 1)
    }
  }
  return result
}

/**
 * Dispatch to the correct parser based on file extension.
 * Throws ParseError for unsupported extensions.
 */
export function parseLogFile(filename: string, content: string): string[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.log')) return parseLogText(content)
  if (lower.endsWith('.json')) return parseJsonLog(content)
  if (lower.endsWith('.ndjson')) return parseNdjsonLog(content)
  throw new ParseError(`Unsupported file type: ${filename}`)
}
