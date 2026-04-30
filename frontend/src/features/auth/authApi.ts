/**
 * Auth API — login, logout, and identity fetch wrappers.
 * [Source: story-1.4]
 */
import { apiGet, apiPost } from '../../lib/apiClient.js'

export interface MeResponse {
  id: number
  username: string
}

export function login(username: string, password: string): Promise<void> {
  return apiPost<void>('/api/v1/auth/login', { username, password })
}

export function logout(): Promise<void> {
  return apiPost<void>('/api/v1/auth/logout', {})
}

export function getMe(): Promise<MeResponse> {
  return apiGet<MeResponse>('/api/v1/auth/me')
}
