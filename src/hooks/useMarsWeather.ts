import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMarsWeather } from '@/lib/api/marsWeather'
import { useUiStore } from '@/store/ui'

export function useMarsWeather() {
  const query = useQuery({
    queryKey: ['mars-weather'],
    queryFn: fetchMarsWeather,
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('marsWeather', query.error != null)
  }, [query.error])

  return query
}
