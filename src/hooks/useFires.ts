import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFires } from '@/lib/api/fires'
import { useUiStore } from '@/store/ui'

export function useFires(enabled = true) {
  const query = useQuery({
    queryKey: ['fires'],
    queryFn: fetchFires,
    staleTime: 4 * 60 * 60 * 1000,
    refetchInterval: 4 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('fires', query.error != null)
  }, [query.error])

  return query
}
