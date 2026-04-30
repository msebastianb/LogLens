import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mockNavigate }))

const mockLogin = vi.fn()
vi.mock('./authApi.js', () => ({ login: mockLogin }))

// Default import (OIDC disabled)
const { default: LoginForm } = await import('./LoginForm.js')

describe('LoginForm (standard mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders username field, password field, and "Sign in" button', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
  })

  it('displays role="alert" error with text "Invalid credentials" after simulated 401', async () => {
    mockLogin.mockRejectedValueOnce({ status: 401 })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/^password$/i), 'secret')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials')
    })
  })

  it('button is disabled and shows "Signing in…" while submitting', async () => {
    let resolve!: () => void
    mockLogin.mockImplementationOnce(() => new Promise<void>((r) => { resolve = r }))
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/^password$/i), 'secret')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
    })

    resolve()
  })

  it('show/hide toggle changes password input type', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    const passwordInput = screen.getByLabelText(/^password$/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})

describe('LoginForm (OIDC mode)', () => {
  it('renders "Sign in with SSO" button and no username/password form when VITE_OIDC_ENABLED is true', async () => {
    vi.stubEnv('VITE_OIDC_ENABLED', 'true')
    vi.resetModules()

    const { default: LoginFormOidc } = await import('./LoginForm.js')
    render(<LoginFormOidc />)

    expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
