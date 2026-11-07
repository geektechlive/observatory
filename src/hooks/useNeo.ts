import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchNeoEnvelope } from '@/lib/api/neo'
import { toError } from '@/lib/toError'
import type { NeoResponse } from '@/schemas/neo'

export function useNeo(): {
  data: NeoResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useSourceQuery('neo', {
    queryKey: ['neo'],
    queryFn: fetchNeoEnvelope,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  return {
    data,
    isLoading,
    error: error == null ? null : toError(error),
  }
}
