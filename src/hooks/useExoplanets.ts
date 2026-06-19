import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchExoplanets } from '@/lib/api/exoplanets'
import { useUiStore } from '@/store/ui'

export function useExoplanets() {
  const query = useQuery({
    queryKey: ['exoplanets'],
    queryFn: fetchExoplanets,
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('exoplanets', query.error != null)
  }, [query.error])

  return query
}
