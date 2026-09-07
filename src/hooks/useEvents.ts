import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchEonetEventsEnvelope } from '@/lib/api/eonet'

export function useEvents() {
  const query = useSourceQuery('eonet', {
    queryKey: ['eonet-events'],
    queryFn: fetchEonetEventsEnvelope,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  return query
}
