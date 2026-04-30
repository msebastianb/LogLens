import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mockNavigate }))

const { mockSubmitSetup } = vi.hoisted(() => ({ mockSubmitSetup: vi.fn() }))
vi.mock('./setupApi.js', () => ({ submitSetup: mockSubmitSetup }))

import FirstRunWizard from './FirstRunWizard.js'

describe('FirstRunWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Welcome to LogLens" heading and "Create account" button', () => {
    render(<FirstRunWizard />)
    expect(screen.getByRole('heading', { name: /welcome to loglens/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^create account$/i })).toBeInTheDocument()
  })

  it('shows inline password error when password is < 12 chars on submit — no API call', async () => {
    const user = userEvent.setup()
    render(<FirstRunWizard />)

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/^password$/i), 'short')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 12 characters')
    })
    expect(mockSubmitSetup).not.toHaveBeenCalled()
  })

  it('shows inline username error when username is empty on submit — no API call', async () => {
    const user = userEvent.setup()
    render(<FirstRunWizard />)

    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument()
    })
    expect(mockSubmitSetup).not.toHaveBeenCalled()
  })

  it('button is disabled and shows "Creating…" while submitting', async () => {
    let resolve!: () => void
    mockSubmitSetup.mockImplementationOnce(() => new Promise<void>((r) => { resolve = r }))
    const user = userEvent.setup()
    render(<FirstRunWizard />)

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/^password$/i), 'validpassword123')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /creating…/i })).toBeDisabled()
    })

    resolve()
  })

  it('show/hide toggle changes password input type', async () => {
    const user = userEvent.setup()
    render(<FirstRunWizard />)

    const passwordInput = screen.getByLabelText(/^password$/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
