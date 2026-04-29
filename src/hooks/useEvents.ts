import { useQuery } from '@tanstack/react-query'
import { fetchEonetEvents } from '@/lib/api/eonet'

export function useEvents() {
  return useQuery({
    queryKey: ['eonet-events'],
    queryFn: fetchEonetEvents,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}
