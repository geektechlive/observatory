import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchQuakesEnvelope } from '@/lib/api/quakes'

/** `enabled` false (a view with no globe, #172) fetches nothing. */
export function useQuakes(enabled = true) {
  const query = useSourceQuery('quakes', {
    queryKey: ['quakes'],
    queryFn: fetchQuakesEnvelope,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled,
  })

  return query
}
