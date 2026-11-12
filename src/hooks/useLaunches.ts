import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchLaunchesEnvelope } from '@/lib/api/launches'
import { toError } from '@/lib/toError'
import type { LaunchesResponse } from '@/schemas/launches'

/** `enabled` false (a view with no globe, #172) fetches nothing. */
export function useLaunches(enabled = true): {
  data: LaunchesResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useSourceQuery('launches', {
    queryKey: ['launches'],
    queryFn: fetchLaunchesEnvelope,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled,
  })

  return {
    data,
    isLoading,
    error: error == null ? null : toError(error),
  }
}
