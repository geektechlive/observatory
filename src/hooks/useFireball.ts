import { useQuery } from '@tanstack/react-query'

import { fetchFireball } from '@/lib/api/fireball'
import { toError } from '@/lib/toError'
import type { FireballResponse } from '@/schemas/fireball'

export function useFireball(enabled = true): {
  data: FireballResponse | undefined
  isLoading: boolean
  error: Error | null
  dataUpdatedAt: number
} {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['fireball'],
    queryFn: fetchFireball,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })

  return {
    data,
    isLoading,
    error: error == null ? null : toError(error),
    dataUpdatedAt,
  }
}
