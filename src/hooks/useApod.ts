import { useQuery } from '@tanstack/react-query'
import { fetchApod } from '@/lib/api/apod'
import type { Apod } from '@/schemas/apod'

function msUntilUtcMidnight(): number {
  const now = new Date()
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return midnight.getTime() - now.getTime()
}

export function useApod(): {
  data: Apod | undefined
  isLoading: boolean
  error: Error | null
} {
  const utcDate = new Date().toISOString().slice(0, 10)

  const { data, isLoading, error } = useQuery({
    queryKey: ['apod', utcDate],
    queryFn: fetchApod,
    staleTime: msUntilUtcMidnight(),
    refetchInterval: msUntilUtcMidnight(),
    refetchOnWindowFocus: false,
  })

  return {
    data,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
