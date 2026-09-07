import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchNeoEnvelope } from '@/lib/api/neo'
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
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
