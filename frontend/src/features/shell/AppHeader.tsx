/**
 * AppHeader — fixed top navigation bar for all authenticated pages.
 *
 * Includes skip link (first focusable element), brand link, nav links with
 * active-state highlighting, logged-in username, and logout button.
 *
 * [Source: story-6.1, Task 1]
 */
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMe, logout } from '../auth/authApi.js'

export default function AppHeader() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const loggingOutRef = useRef(false)

  const { data: me, isError } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  })

  // Redirect to /login if the session expires mid-use
  useEffect(() => {
    if (isError) void navigate({ to: '/login' })
  }, [isError, navigate])

  async function handleLogout() {
    if (loggingOutRef.current) return
    loggingOutRef.current = true
    try {
      await logout()
    } catch {
      // Server-side session teardown failed — still clear local state and redirect
    }
    queryClient.removeQueries({ queryKey: ['me'] })
    await navigate({ to: '/login' })
  }

  return (
    <header
      role="banner"
      className="h-14 w-full border-b border-zinc-200 bg-white px-6 flex items-center gap-6 sticky top-0 z-40"
    >
      {/* Skip link — visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-1 focus:text-sm focus:ring-2 focus:ring-teal-600"
      >
        Skip to main content
      </a>

      {/* Brand */}
      <Link
        to="/"
        className="text-sm font-bold tracking-tight text-zinc-900 hover:text-teal-600 transition-colors duration-150 flex items-center gap-0.5"
      >
        Log<span className="text-teal-600">Lens</span>
      </Link>

      {/* Navigation */}
      <nav role="navigation" aria-label="Main navigation" className="flex items-center gap-1">
        <Link
          to="/"
          activeProps={{ className: 'text-teal-600 font-medium bg-teal-50 rounded-md px-3 py-1.5 text-sm', 'aria-current': 'page' as const }}
          inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md px-3 py-1.5 text-sm transition-colors duration-150' }}
          activeOptions={{ exact: true }}
        >
          Dashboard
        </Link>
        <Link
          to="/analysis"
          activeProps={{ className: 'text-teal-600 font-medium bg-teal-50 rounded-md px-3 py-1.5 text-sm', 'aria-current': 'page' as const }}
          inactiveProps={{ className: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md px-3 py-1.5 text-sm transition-colors duration-150' }}
        >
          Analysis
        </Link>
      </nav>

      {/* Spacer */}
      <div className="ml-auto flex items-center gap-3">
        {/* Username */}
        <span
          className="text-xs text-zinc-400 font-medium hidden sm:block"
          aria-label={`Logged in as ${me?.username ?? 'loading'}`}
        >
          {me?.username ?? '…'}
        </span>

        {/* Logout */}
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="text-xs text-zinc-500 hover:text-zinc-900 border border-zinc-200 hover:border-zinc-300 rounded-md px-2.5 py-1 transition-colors duration-150 cursor-pointer"
        >
          Log out
        </button>
      </div>
    </header>
  )
}
