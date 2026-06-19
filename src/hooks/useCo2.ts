import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCo2 } from '@/lib/api/co2'
import { useUiStore } from '@/store/ui'

export function useCo2() {
  const query = useQuery({
    queryKey: ['co2'],
    queryFn: fetchCo2,
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('co2', query.error != null)
  }, [query.error])

  return query
}
