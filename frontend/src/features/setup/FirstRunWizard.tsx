/**
 * FirstRunWizard — setup form shown on first launch.
 *
 * Collects username + password (min 12 chars), submits to POST /api/v1/setup,
 * then navigates to /login on success.
 *
 * [Source: story-1.3, AC2, AC4]
 */
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'
import { submitSetup } from './setupApi.js'
import AuthLayout from '../auth/AuthLayout.js'

export default function FirstRunWizard() {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)
    setUsernameError(null)
    setPasswordError(null)

    let hasError = false
    if (!username.trim()) {
      setUsernameError('Username is required')
      hasError = true
    }
    if (password.length < 12) {
      setPasswordError('Password must be at least 12 characters')
      hasError = true
    }
    if (hasError) return

    setSubmitting(true)

    try {
      await submitSetup(username, password)
      await navigate({ to: '/login' })
    } catch (ex) {
      const error = ex as { status?: number; message?: string }
      if (error.status === 409) {
        setServerError('Setup already complete. Redirecting to login…')
        setTimeout(() => void navigate({ to: '/login' }), 1500)
      } else {
        setServerError(error.message ?? 'An unexpected error occurred')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Welcome to LogLens" subtitle="Create your admin account to get started">
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
            required
            aria-describedby={usernameError ? 'username-error' : undefined}
            className="w-full text-sm border border-zinc-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-zinc-50 transition-colors duration-150"
          />
          {usernameError && (
            <p id="username-error" role="alert" className="text-xs text-red-600 mt-1">
              {usernameError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
              minLength={12}
              aria-describedby={passwordError ? 'password-error' : 'password-hint'}
              className="w-full text-sm border border-zinc-300 rounded-lg px-3 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-zinc-50 transition-colors duration-150"
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer transition-colors duration-150"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p id="password-hint" className="text-xs text-zinc-400 mt-1.5">
            Must be at least 12 characters
          </p>
          {passwordError && (
            <p id="password-error" role="alert" className="text-xs text-red-600 mt-1">
              {passwordError}
            </p>
          )}
        </div>

        {serverError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold py-2.5 px-4 rounded-lg disabled:opacity-50 transition-colors duration-150 cursor-pointer mt-1"
        >
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
