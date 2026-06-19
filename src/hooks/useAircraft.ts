import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAircraft } from '@/lib/api/aircraft'
import { useUiStore } from '@/store/ui'

export function useAircraft(enabled: boolean) {
  const query = useQuery({
    queryKey: ['aircraft'],
    queryFn: fetchAircraft,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('aircraft', query.error != null)
  }, [query.error])

  return query
}
