import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPeopleInSpace } from '@/lib/api/peopleInSpace'
import { useUiStore } from '@/store/ui'

export function usePeopleInSpace() {
  const query = useQuery({
    queryKey: ['people-in-space'],
    queryFn: fetchPeopleInSpace,
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('peopleInSpace', query.error != null)
  }, [query.error])

  return query
}
