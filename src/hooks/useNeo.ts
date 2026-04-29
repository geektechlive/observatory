import { useQuery } from '@tanstack/react-query'
import { fetchNeo } from '@/lib/api/neo'
import type { NeoResponse } from '@/schemas/neo'

export function useNeo(): {
  data: NeoResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['neo'],
    queryFn: fetchNeo,
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
