import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchSolarWindEnvelope } from '@/lib/api/solarWind'
import { toError } from '@/lib/toError'
import type { SolarWind } from '@/schemas/solarWind'

export function useSolarWind(): {
  data: SolarWind | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useSourceQuery('solar-wind', {
    queryKey: ['solarWind'],
    queryFn: fetchSolarWindEnvelope,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  return {
    data,
    isLoading,
    error: error == null ? null : toError(error),
  }
}
