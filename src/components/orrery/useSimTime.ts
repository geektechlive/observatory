import { useEffect, useState } from 'react'

import { simTimeAt, useOrreryClock } from '@/store/orreryClock'

/** Readout refresh: 4 Hz is plenty for text, and React renders nothing per frame. */
export const READOUT_MS = 250

/**
 * The simulated time and the wall time it was read at, refreshed at 4 Hz and whenever
 * the clock's anchor changes. Wall time lives in state, so render stays pure.
 */
export function useSimTime(intervalMs = READOUT_MS): { sim: number; wall: number } {
  const clock = useOrreryClock()
  const [wall, setWall] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => {
      setWall(Date.now())
    }
    // Re-read at once after an anchor change (Now, a rate), then at the readout rate.
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [intervalMs, clock.anchorSim, clock.anchorWall, clock.rate, clock.playing])
  return { sim: simTimeAt(clock, wall), wall }
}
