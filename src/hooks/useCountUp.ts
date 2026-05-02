import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export function useCountUp(target: number, duration = 600): number {
  const reducedMotion = useReducedMotion()
  const [display, setDisplay] = useState(target)
  const prevRef = useRef(target)

  useEffect(() => {
    if (reducedMotion) {
      prevRef.current = target
      return
    }
    const from = prevRef.current
    prevRef.current = target
    if (from === target) return
    const startTs = performance.now()
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    let rafId: number
    const tick = (now: number) => {
      const t = Math.min((now - startTs) / duration, 1)
      setDisplay(Math.round(from + (target - from) * easeOut(t)))
      if (t < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [target, duration, reducedMotion])

  return reducedMotion ? target : display
}
