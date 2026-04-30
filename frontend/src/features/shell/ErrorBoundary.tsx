/**
 * ErrorBoundary — catches uncaught React render errors in the authenticated layout.
 *
 * Renders a recovery message with a link back to the dashboard so the user is
 * never left on a blank page.
 *
 * [Source: story-6.1, Task 5]
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in development; swap for a monitoring service if needed
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">Something went wrong</h1>
          <p className="text-sm text-zinc-500">
            An unexpected error occurred. Your other work is not affected.
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="text-sm text-teal-600 font-medium hover:text-teal-700 transition-colors duration-150"
            >
              Try again
            </button>
            <a
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors duration-150"
            >
              Return to Dashboard
            </a>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
