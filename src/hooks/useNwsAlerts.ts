import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchNwsAlerts } from '@/lib/api/nws'
import { useUiStore } from '@/store/ui'

export function useNwsAlerts(enabled: boolean) {
  const query = useQuery({
    queryKey: ['nws-alerts'],
    queryFn: fetchNwsAlerts,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('nws', query.error != null)
  }, [query.error])

  return query
}
