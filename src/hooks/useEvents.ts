import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEonetEvents } from '@/lib/api/eonet'
import { useUiStore } from '@/store/ui'

export function useEvents() {
  const query = useQuery({
    queryKey: ['eonet-events'],
    queryFn: fetchEonetEvents,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('eonet', query.error != null)
  }, [query.error])

  return query
}
