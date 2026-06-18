import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSolarActivity } from '@/lib/api/solarActivity'
import { useUiStore } from '@/store/ui'

export function useSolarActivity() {
  const query = useQuery({
    queryKey: ['solar-activity'],
    queryFn: fetchSolarActivity,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('solarActivity', query.error != null)
  }, [query.error])

  return query
}
