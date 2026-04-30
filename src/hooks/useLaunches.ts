import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLaunches } from '@/lib/api/launches'
import type { LaunchesResponse } from '@/schemas/launches'
import { useUiStore } from '@/store/ui'

export function useLaunches(): {
  data: LaunchesResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['launches'],
    queryFn: fetchLaunches,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('launches', error != null)
  }, [error])

  return {
    data,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
