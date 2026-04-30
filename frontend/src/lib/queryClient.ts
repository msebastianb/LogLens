/**
 * TanStack Query client — shared instance for the whole SPA.
 * [Source: story-1.3]
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
