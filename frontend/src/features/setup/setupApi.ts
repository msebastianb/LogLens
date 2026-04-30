/**
 * Setup API — fetches setup status and submits first-run wizard form.
 * [Source: story-1.3]
 */
import { apiGet, apiPost } from '../../lib/apiClient.js'

export interface SetupStatus {
  firstRunComplete: boolean
}

export function getSetupStatus(): Promise<SetupStatus> {
  return apiGet<SetupStatus>('/api/v1/setup')
}

export function submitSetup(username: string, password: string): Promise<void> {
  return apiPost<void>('/api/v1/setup', { username, password })
}
