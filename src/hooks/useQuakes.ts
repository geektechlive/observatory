import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchQuakesEnvelope } from '@/lib/api/quakes'

export function useQuakes() {
  const query = useSourceQuery('quakes', {
    queryKey: ['quakes'],
    queryFn: fetchQuakesEnvelope,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  return query
}
