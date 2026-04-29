import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchDonki } from '@/lib/api/donki'
import type { DonkiResponse } from '@/schemas/donki'
import { useUiStore } from '@/store/ui'

export function useDonki(): {
  data: DonkiResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['donki'],
    queryFn: fetchDonki,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('donki', error != null)
  }, [error])

  return {
    data,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
