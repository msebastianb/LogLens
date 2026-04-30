/**
 * TanStack Router v1 — code-based route tree.
 *
 * Route guards (beforeLoad):
 *   /         — redirect to /setup if firstRunComplete = false; then verify JWT
 *   /analysis — verify JWT (redirect to /login on failure)
 *   /setup    — redirect to /login if firstRunComplete = true
 *   /login    — no guard (always accessible)
 *
 * Layout:
 *   authenticatedLayoutRoute — wraps / and /analysis in AppShell (header + main)
 *
 * [Source: story-1.3, AC1, AC3; story-6.1, Task 3]
 */
import { createRouter, createRoute, createRootRoute, NotFoundRoute, redirect, Link } from '@tanstack/react-router'
import FirstRunWizard from './features/setup/FirstRunWizard.js'
import LoginForm from './features/auth/LoginForm.js'
import AnalysisView from './features/analysis/AnalysisView.js'
import AppShell from './features/shell/AppShell.js'
import DashboardPage from './features/dashboard/DashboardPage.js'
import NotFound from './features/shell/NotFound.js'
import ErrorBoundary from './features/shell/ErrorBoundary.js'
import { getSetupStatus } from './features/setup/setupApi.js'
import { getMe } from './features/auth/authApi.js'

// ─── Root ─────────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  errorComponent: ({ error }) => {
    // Wrap in ErrorBoundary's fallback UI — class component covers render errors;
    // this covers loader/action thrown errors at root level.
    console.error('[rootRoute error]', error)
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center p-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Something went wrong</h1>
        <p className="text-sm text-zinc-500">An unexpected error occurred. Your other work is not affected.</p>
        <Link to="/" className="text-sm text-teal-600 font-medium hover:text-teal-700 transition-colors duration-150">
          Return to Dashboard
        </Link>
      </div>
    )
  },
})

// ─── Authenticated layout (AppShell wraps / and /analysis) ───────────────────

const authenticatedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: AppShell,
})

// ─── Protected routes (children of authenticatedLayoutRoute) ─────────────────

const indexRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  path: '/',
  component: DashboardPage,
  beforeLoad: async () => {
    let firstRunComplete: boolean
    try {
      const result = await getSetupStatus()
      firstRunComplete = result.firstRunComplete
    } catch {
      throw redirect({ to: '/login' })
    }
    if (!firstRunComplete) throw redirect({ to: '/setup' })
    try {
      await getMe()
    } catch {
      throw redirect({ to: '/login' })
    }
  },
})

const analysisRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  path: '/analysis',
  component: AnalysisView,
  beforeLoad: async () => {
    try {
      await getMe()
    } catch {
      throw redirect({ to: '/login' })
    }
  },
})

// ─── Public routes ────────────────────────────────────────────────────────────

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: FirstRunWizard,
  beforeLoad: async () => {
    let firstRunComplete: boolean
    try {
      const result = await getSetupStatus()
      firstRunComplete = result.firstRunComplete
    } catch {
      throw redirect({ to: '/login' })
    }
    if (firstRunComplete) throw redirect({ to: '/login' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginForm,
})

// ─── Not found ────────────────────────────────────────────────────────────────

const notFoundRoute = new NotFoundRoute({
  getParentRoute: () => rootRoute,
  component: NotFound,
})

// ─── Route tree ───────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  authenticatedLayoutRoute.addChildren([indexRoute, analysisRoute]),
  setupRoute,
  loginRoute,
])

export const router = createRouter({ routeTree, notFoundRoute })

// Register router for useNavigate / useRouter typings
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Re-export ErrorBoundary for use in main.tsx if needed
export { ErrorBoundary }

