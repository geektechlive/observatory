import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchIssTle } from '@/lib/api/iss'
import { propagateIss, computeTrail } from '@/lib/orbit/propagate'
import type { IssPosition } from '@/lib/orbit/propagate'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useUiStore } from '@/store/ui'

export interface IssState {
  position: IssPosition | null
  trail: [number, number][]
  isLoading: boolean
  error: Error | null
}

export function useIss(): IssState {
  const reducedMotion = useReducedMotion()
  const {
    data: tle,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['iss-tle'],
    queryFn: fetchIssTle,
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: 24 * 60 * 60 * 1000,
  })

  const trail = useMemo(() => {
    if (!tle) return []
    return computeTrail(tle.line1, tle.line2, new Date())
  }, [tle])

  const [position, setPosition] = useState<IssPosition | null>(null)
  const lastUpdateRef = useRef<number>(0)

  useEffect(() => {
    if (!tle) return

    if (reducedMotion) {
      const rafId = requestAnimationFrame(() => {
        const pos = propagateIss(tle.line1, tle.line2, new Date())
        if (pos !== null) setPosition(pos)
      })
      return () => cancelAnimationFrame(rafId)
    }

    let rafId: number

    const tick = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= 200) {
        lastUpdateRef.current = timestamp
        const pos = propagateIss(tle.line1, tle.line2, new Date())
        if (pos !== null) setPosition(pos)
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [tle, reducedMotion])

  useEffect(() => {
    useUiStore.getState().setSourceError('iss', error != null)
  }, [error])

  return {
    position,
    trail,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
  }
}
