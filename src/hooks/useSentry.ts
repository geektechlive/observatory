import { useQuery } from '@tanstack/react-query'
import { fetchSentry } from '@/lib/api/sentry'
import type { SentryResponse } from '@/schemas/sentry'

export function useSentry(): {
  data: SentryResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sentry'],
    queryFn: fetchSentry,
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  return {
    data,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
