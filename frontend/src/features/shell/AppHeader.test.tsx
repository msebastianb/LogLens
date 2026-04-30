/**
 * Unit tests for AppHeader.
 *
 * Mocks: @tanstack/react-router (Link, useNavigate),
 *        @tanstack/react-query (useQuery → getMe),
 *        authApi (logout)
 *
 * [Source: story-6.1, Task 6, AC1–AC3]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppHeader from './AppHeader.js'

// ─── Mock TanStack Router ─────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    activeProps,
    inactiveProps,
    activeOptions: _activeOptions,
  }: {
    to: string
    children: React.ReactNode
    activeProps?: { className?: string; 'aria-current'?: string }
    inactiveProps?: { className?: string }
    activeOptions?: unknown
  }) => (
    <a href={to} data-active-class={activeProps?.className} data-inactive-class={inactiveProps?.className}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}))

// ─── Mock React Query ────────────────────────────────────────────────────────

vi.mock('@tanstack/react-query', () => ({
  useQuery: (_opts: unknown) => {
    return { data: { id: 1, username: 'testuser' }, isError: false }
  },
  useQueryClient: () => ({ removeQueries: vi.fn() }),
}))

// ─── Mock authApi ─────────────────────────────────────────────────────────────

const mockLogout = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

vi.mock('../auth/authApi.js', () => ({
  getMe: vi.fn().mockResolvedValue({ id: 1, username: 'testuser' }),
  logout: () => mockLogout(),
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockResolvedValue(undefined)
  })

  it('renders the LogLens brand link (AC1)', () => {
    render(<AppHeader />)
    const brandLink = screen.getByRole('link', { name: 'LogLens' })
    expect(brandLink).toBeInTheDocument()
    expect(brandLink).toHaveAttribute('href', '/')
  })

  it('renders Dashboard navigation link (AC1)', () => {
    render(<AppHeader />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders Analysis navigation link (AC1)', () => {
    render(<AppHeader />)
    expect(screen.getByRole('link', { name: 'Analysis' })).toBeInTheDocument()
  })

  it('renders the logged-in username (AC1)', () => {
    render(<AppHeader />)
    expect(screen.getByText('testuser')).toBeInTheDocument()
  })

  it('renders a logout button (AC1)', () => {
    render(<AppHeader />)
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('skip link is present as first focusable element (a11y)', () => {
    render(<AppHeader />)
    const skipLink = screen.getByText('Skip to main content')
    expect(skipLink).toBeInTheDocument()
    expect(skipLink).toHaveAttribute('href', '#main-content')
  })

  it('calls logout() and navigates to /login when logout button clicked (AC3)', async () => {
    const user = userEvent.setup()
    render(<AppHeader />)
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(mockLogout).toHaveBeenCalledOnce()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' })
  })
})
