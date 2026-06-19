import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGeomag } from '@/lib/api/geomag'
import { useUiStore } from '@/store/ui'

export function useGeomag() {
  const query = useQuery({
    queryKey: ['geomag'],
    queryFn: fetchGeomag,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('geomag', query.error != null)
  }, [query.error])

  return query
}
