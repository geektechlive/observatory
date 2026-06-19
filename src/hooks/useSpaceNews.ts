import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSpaceNews } from '@/lib/api/spaceNews'
import { useUiStore } from '@/store/ui'

export function useSpaceNews() {
  const query = useQuery({
    queryKey: ['space-news'],
    queryFn: fetchSpaceNews,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('spaceNews', query.error != null)
  }, [query.error])

  return query
}
