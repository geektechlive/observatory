import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGdacs } from '@/lib/api/gdacs'
import { useUiStore } from '@/store/ui'

export function useGdacs(enabled = true) {
  const query = useQuery({
    queryKey: ['gdacs'],
    queryFn: fetchGdacs,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('gdacs', query.error != null)
  }, [query.error])

  return query
}
