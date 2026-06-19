import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBuoys } from '@/lib/api/buoys'
import { useUiStore } from '@/store/ui'

export function useBuoys(enabled: boolean) {
  const query = useQuery({
    queryKey: ['buoys'],
    queryFn: fetchBuoys,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('buoys', query.error != null)
  }, [query.error])

  return query
}
