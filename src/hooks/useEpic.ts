import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEpic } from '@/lib/api/epic'
import type { EpicResponse } from '@/schemas/epic'
import { useUiStore } from '@/store/ui'

export function useEpic(): {
  data: EpicResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['epic'],
    queryFn: fetchEpic,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('epic', error != null)
  }, [error])

  return {
    data,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
