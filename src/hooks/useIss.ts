import { useEffect, useMemo, useRef, useState } from 'react'

import { useIssTle } from '@/hooks/useIssTle'
import { usePropagate } from '@/hooks/usePropagate'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { IssPosition } from '@/lib/orbit/propagate'

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

/**
 * The live ISS. `enabled` false (the Sun and Sky views, which draw no globe, #172)
 * fetches no TLE, loads no SGP4 and runs no update loop.
 */
export function useIss(enabled = true): IssState {
  const reducedMotion = useReducedMotion()
  const { data: tle, isLoading, error } = useIssTle(enabled)
  // satellite.js is not in the page's first load (#97). Its import starts when this
  // hook mounts, alongside the TLE fetch: started only after the TLE, the readout came
  // ~240 ms later on a 4G profile.
  const sgp4 = usePropagate(enabled)

  const trail = useMemo(() => {
    if (!enabled || !tle || !sgp4) return []
    return sgp4.computeTrail(tle.line1, tle.line2, new Date())
  }, [enabled, tle, sgp4])

  const [position, setPosition] = useState<IssPosition | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const intervalMs = reducedMotion ? REDUCED_INTERVAL_MS : LIVE_INTERVAL_MS

  useEffect(() => {
    // A disabled hook can still see a cached TLE; it must not keep the 5 Hz loop alive.
    if (!enabled || !tle || !sgp4) return

    const update = () => {
      const pos = sgp4.propagateIss(tle.line1, tle.line2, new Date())
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
  }, [enabled, tle, sgp4, reducedMotion])

  return { position, trail, isLoading, error, intervalMs }
}
