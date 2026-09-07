import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchGeomagEnvelope } from '@/lib/api/geomag'

export function useGeomag() {
  const query = useSourceQuery('geomag', {
    queryKey: ['geomag'],
    queryFn: fetchGeomagEnvelope,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  return query
}
