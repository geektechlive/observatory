import { useEffect, useState } from 'react'

import { useSpaceTrack } from '@/hooks/useSpaceTrack'

/** How long the first fill waits for Space-Track before it starts without it (#175). */
export const FIRST_FILL_DEADLINE_MS = 3000

/**
 * Whether the strip may fill. Re-entries lead it (#101), but Space-Track often answers
 * after EONET, and putting them in front of items already scrolling is a layout shift
 * (#175). So the first fill waits until Space-Track has answered (or failed), or the
 * deadline passes. Once open it stays open: a query that has settled never goes back to
 * pending, and the deadline only fires once.
 *
 * With reduced motion there is no deadline: the still strip shows only its first 8
 * items, so a late Space-Track answer would leave the re-entries off it entirely.
 */
export function useFirstFillReady(reducedMotion: boolean): boolean {
  const { isPending } = useSpaceTrack()
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (reducedMotion) return
    const timer = setTimeout(() => {
      setTimedOut(true)
    }, FIRST_FILL_DEADLINE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [reducedMotion])
  return !isPending || timedOut
}
