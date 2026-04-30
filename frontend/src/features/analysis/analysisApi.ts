/**
 * uploadLogFile — POST /api/v1/logs/upload with multipart/form-data.
 *
 * Fetches a CSRF token first (shared cache from apiClient) then posts
 * the file. Returns the parsed line array from the server.
 * [Source: story-2.4, AC1, AC4]
 *
 * postAnalysisJob — POST /api/v1/analysis-jobs with { cacheId }.
 * Returns { jobId } for SSE streaming.
 * [Source: story-5.5, AC3]
 */
import { apiGet, apiPost } from '../../lib/apiClient.js'

export interface RedactionItem {
  type: string
  start: number
  end: number
}

export interface UploadResult {
  cacheId: string
  lineCount: number
  redactionSummary: RedactionItem[]
}

export interface AnalysisOutput {
  errors: Array<{ type: string; count: number; distribution: string }>
  anomalies: string[]
  rootCause: {
    hypothesis: string
    confidence: 'High' | 'Medium' | 'Low'
    evidenceExcerpts: string[]
  }
  timeline: Array<{ timestamp: string; component: string; event: string }>
  /** Included for forward-compat with Story 4.5 — not rendered in this story */
  nextSteps: string[]
}

// Re-use the same CSRF cache path used by apiPost — a small standalone
// fetch so we don't have to import internals from apiClient.
async function fetchCsrfToken(): Promise<string> {
  const data = await apiGet<{ token: string }>('/api/v1/csrf/token')
  return data.token
}

export async function uploadLogFile(file: File): Promise<UploadResult> {
  const token = await fetchCsrfToken()

  const form = new FormData()
  form.append('file', file)

  const res = await fetch('/api/v1/logs/upload', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    credentials: 'include',
    body: form,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Upload failed' }))
    const err = new Error(
      (body as Record<string, string>).message ?? 'Upload failed',
    ) as Error & { status: number }
    err.status = res.status
    throw err
  }

  return res.json() as Promise<UploadResult>
}

export async function postAnalysisJob(cacheId: string): Promise<{ jobId: string }> {
  return apiPost<{ jobId: string }>('/api/v1/analysis-jobs', { cacheId })
}
