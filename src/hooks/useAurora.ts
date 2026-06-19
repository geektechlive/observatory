import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAurora } from '@/lib/api/aurora'
import { useUiStore } from '@/store/ui'

export function useAurora(enabled: boolean) {
  const query = useQuery({
    queryKey: ['aurora'],
    queryFn: fetchAurora,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('aurora', query.error != null)
  }, [query.error])

  return query
}
