import { useEffect, useMemo, useRef, useState } from 'react'

import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useSourceQuery } from '@/hooks/useSourceQuery'
import { fetchIssTleEnvelope } from '@/lib/api/iss'
import type { IssPosition } from '@/lib/orbit/propagate'
import { computeTrail, propagateIss } from '@/lib/orbit/propagate'

/** Smooth-motion cadence: 5 Hz SGP4, matching the on-screen readout. */
const LIVE_INTERVAL_MS = 200
/** Reduced-motion cadence: still live, just not animated. */
const REDUCED_INTERVAL_MS = 10_000

export interface IssState {
  position: IssPosition | null
  trail: [number, number][]
  isLoading: boolean
  error: Error | null
  /** Actual propagation cadence in ms, so the UI can label itself honestly. */
  intervalMs: number
}

export function useIss(): IssState {
  const reducedMotion = useReducedMotion()
  const {
    data: tle,
    isLoading,
    error,
  } = useSourceQuery('iss-tle', {
    queryKey: ['iss-tle'],
    queryFn: fetchIssTleEnvelope,
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: 24 * 60 * 60 * 1000,
  })

  const trail = useMemo(() => {
    if (!tle) return []
    return computeTrail(tle.line1, tle.line2, new Date())
  }, [tle])

  const [position, setPosition] = useState<IssPosition | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const intervalMs = reducedMotion ? REDUCED_INTERVAL_MS : LIVE_INTERVAL_MS

  useEffect(() => {
    if (!tle) return

    const update = () => {
      const pos = propagateIss(tle.line1, tle.line2, new Date())
      if (pos !== null) setPosition(pos)
    }

    update()

    // Reduced motion means "do not animate", not "freeze the station in place":
    // a slow interval keeps the position truthful without a per-frame loop.
    if (reducedMotion) {
      const id = setInterval(update, REDUCED_INTERVAL_MS)
      return () => {
        clearInterval(id)
      }
    }

    let rafId: number
    const tick = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= LIVE_INTERVAL_MS) {
        lastUpdateRef.current = timestamp
        update()
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [tle, reducedMotion])

  return { position, trail, isLoading, error, intervalMs }
}
