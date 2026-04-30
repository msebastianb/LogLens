/**
 * NotFound — rendered when the user navigates to an unknown route.
 *
 * [Source: story-6.1, Task 4]
 */
import { Link } from '@tanstack/react-router'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900">Page not found</h1>
      <p className="text-sm text-zinc-500">
        The page you requested does not exist.
      </p>
      <Link
        to="/"
        className="text-sm text-teal-600 font-medium hover:text-teal-700 transition-colors duration-150"
      >
        Return to Dashboard
      </Link>
    </div>
  )
}
