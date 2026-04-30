/**
 * LoginForm — username/password login UI.
 *
 * AC5: if VITE_OIDC_ENABLED=true, hides the form and shows SSO button only.
 * On success (200): navigate to '/'.
 * On 401: show "Invalid credentials".
 *
 * [Source: story-1.4, AC1, AC2, AC5]
 */
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'
import { login } from './authApi.js'
import AuthLayout from './AuthLayout.js'

const oidcEnabled = import.meta.env.VITE_OIDC_ENABLED === 'true'

export default function LoginForm() {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login(username, password)
      await navigate({ to: '/' })
    } catch (ex) {
      const err = ex as { status?: number }
      if (err.status === 401 || err.status === 429) {
        setError(err.status === 429 ? 'Too many attempts. Please wait.' : 'Invalid credentials')
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // AC5: OIDC mode — show SSO button only
  if (oidcEnabled) {
    return (
      <AuthLayout>
        <a href="/api/v1/auth/oidc/login">
          <button
            type="button"
            className="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2 px-4 rounded-md disabled:opacity-50 transition-colors duration-150"
          >
            Sign in with SSO
          </button>
        </a>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
            required
            className="w-full text-sm border border-zinc-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-zinc-50 transition-colors duration-150"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
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
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold py-2.5 px-4 rounded-lg disabled:opacity-50 transition-colors duration-150 cursor-pointer mt-1"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}
