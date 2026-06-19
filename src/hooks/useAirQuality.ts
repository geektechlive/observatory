import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAirQuality } from '@/lib/api/airQuality'
import { useUiStore } from '@/store/ui'

export function useAirQuality(enabled: boolean) {
  const query = useQuery({
    queryKey: ['air-quality'],
    queryFn: fetchAirQuality,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('airQuality', query.error != null)
  }, [query.error])

  return query
}
