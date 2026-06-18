import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPlanets } from '@/lib/api/planets'
import { useUiStore } from '@/store/ui'

export function usePlanets() {
  const query = useQuery({
    queryKey: ['planets'],
    queryFn: fetchPlanets,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('planets', query.error != null)
  }, [query.error])

  return query
}
