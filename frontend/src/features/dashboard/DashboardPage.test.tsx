import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

const mockUseQuery = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}))

import DashboardPage from './DashboardPage.js'

describe('DashboardPage', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: { id: 1, username: 'testuser' }, isError: false })
  })

  it('renders "Welcome back, testuser" when getMe resolves with username: "testuser"', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Welcome back, testuser')).toBeInTheDocument()
  })

  it('renders loading placeholder "Welcome back, …" when data is undefined', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isError: false })
    render(<DashboardPage />)
    expect(screen.getByText('Welcome back, \u2026')).toBeInTheDocument()
  })

  it('renders a "Start New Analysis" link pointing to "/analysis"', () => {
    render(<DashboardPage />)
    const link = screen.getByRole('link', { name: 'Start New Analysis' })
    expect(link).toHaveAttribute('href', '/analysis')
  })
})
