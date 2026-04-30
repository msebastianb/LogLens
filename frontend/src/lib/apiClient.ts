/**
 * Thin fetch wrapper — sets Content-Type + credentials on every request.
 * Injects x-csrf-token on state-mutating requests (lazy-init, cached per session).
 * [Source: story-1.3, story-1.6]
 */

interface ApiError extends Error {
  status: number
  body: unknown
}

// CSRF token cache — refreshed on 403 (token rotation or expiry)
let csrfToken: string | null = null

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  const res = await fetch('/api/v1/csrf/token', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch CSRF token')
  const data = (await res.json()) as { token: string }
  csrfToken = data.token
  return csrfToken
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getCsrfToken()
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': token,
    },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    if (res.status === 403) {
      // Token may have rotated — clear so next request re-fetches
      csrfToken = null
    }
    const err = await res.json().catch(() => ({ title: 'Request failed' }))
    const error = new Error(
      (err as Record<string, string>).message ?? (err as Record<string, string>).title ?? 'Request failed',
    ) as ApiError
    error.status = res.status
    error.body = err
    throw error
  }
  // 204 or empty body — return undefined cast to T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}
