import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSolarWind } from '@/lib/api/solarWind'
import type { SolarWind } from '@/schemas/solarWind'
import { useUiStore } from '@/store/ui'

export function useSolarWind(): {
  data: SolarWind | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['solarWind'],
    queryFn: fetchSolarWind,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('solarWind', error != null)
  }, [error])

  return {
    data,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
