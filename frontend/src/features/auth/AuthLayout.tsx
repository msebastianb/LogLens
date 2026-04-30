import type { ReactNode } from 'react'

interface AuthLayoutProps {
  title?: string
  subtitle?: string
  children: ReactNode
}

export default function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        {/* Brand header — outside the card */}
        <div className="text-center mb-8">
          <p className="text-2xl font-bold tracking-tight text-zinc-900">
            Log<span className="text-teal-600">Lens</span>
          </p>
          <p className="text-sm text-zinc-500 mt-1">Privacy-first AI log analysis</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-8 space-y-5">
          {title && title !== 'LogLens' && (
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
              {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
            </div>
          )}
          {(!title || title === 'LogLens') && (
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">{title ?? 'Sign in to LogLens'}</h1>
              {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
