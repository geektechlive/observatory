import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCme } from '@/lib/api/cme'
import { useUiStore } from '@/store/ui'

export function useCme() {
  const query = useQuery({
    queryKey: ['cme'],
    queryFn: fetchCme,
    staleTime: 3 * 60 * 60 * 1000,
    refetchInterval: 3 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('cme', query.error != null)
  }, [query.error])

  return query
}
