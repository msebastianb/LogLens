/**
 * Unit tests for NotFound screen.
 *
 * [Source: story-6.1, Test Scenarios]
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotFound from './NotFound.js'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

describe('NotFound', () => {
  it('renders "Page not found" heading', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('renders "Return to Dashboard" link pointing to /', () => {
    render(<NotFound />)
    const link = screen.getByRole('link', { name: 'Return to Dashboard' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
  })
})
