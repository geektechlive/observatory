import { useQuery } from '@tanstack/react-query'

import { fetchSentry } from '@/lib/api/sentry'
import { toError } from '@/lib/toError'
import type { SentryResponse } from '@/schemas/sentry'

export function useSentry(): {
  data: SentryResponse | undefined
  isLoading: boolean
  error: Error | null
  dataUpdatedAt: number
} {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['sentry'],
    queryFn: fetchSentry,
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  return {
    data,
    isLoading,
    error: error == null ? null : toError(error),
    dataUpdatedAt,
  }
}
