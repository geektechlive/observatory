import { useQuery } from '@tanstack/react-query'
import { fetchFireball } from '@/lib/api/fireball'
import type { FireballResponse } from '@/schemas/fireball'

export function useFireball(): {
  data: FireballResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['fireball'],
    queryFn: fetchFireball,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  return {
    data,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
