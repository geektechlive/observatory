import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchLaunchesEnvelope } from '@/lib/api/launches'
import type { LaunchesResponse } from '@/schemas/launches'

export function useLaunches(): {
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
  })

  return {
    data,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
