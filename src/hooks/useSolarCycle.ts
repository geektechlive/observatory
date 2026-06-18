import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSolarCycle } from '@/lib/api/solarCycle'
import { useUiStore } from '@/store/ui'

export function useSolarCycle() {
  const query = useQuery({
    queryKey: ['solar-cycle'],
    queryFn: fetchSolarCycle,
    staleTime: 3 * 60 * 60 * 1000,
    refetchInterval: 3 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('solarCycle', query.error != null)
  }, [query.error])

  return query
}
