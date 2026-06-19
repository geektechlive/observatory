import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSwpcAlerts } from '@/lib/api/swpcAlerts'
import { useUiStore } from '@/store/ui'

export function useSwpcAlerts() {
  const query = useQuery({
    queryKey: ['swpc-alerts'],
    queryFn: fetchSwpcAlerts,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('swpcAlerts', query.error != null)
  }, [query.error])

  return query
}
