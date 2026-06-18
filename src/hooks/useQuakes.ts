import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchQuakes } from '@/lib/api/quakes'
import { useUiStore } from '@/store/ui'

export function useQuakes() {
  const query = useQuery({
    queryKey: ['quakes'],
    queryFn: fetchQuakes,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('quakes', query.error != null)
  }, [query.error])

  return query
}
