import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchAftershocksEnvelope } from '@/lib/api/aftershocks'

/** USGS aftershock odds for the strongest quakes of the last 30 days (#76). */
export function useAftershocks() {
  return useSourceQuery('aftershocks', {
    queryKey: ['aftershocks'],
    queryFn: fetchAftershocksEnvelope,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
