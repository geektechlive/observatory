import { memo, useEffect, useMemo, useState } from 'react'

import { coastPathData } from '../useGlobeProjection'
import { landRings, landRingsNow, type Ring } from './landRings'

interface CoastlinesProps {
  rotation: number
  R: number
  strokeColor: string
  fillColor: string
}

/** Coastlines from world-atlas 110m; draws nothing until the land chunk arrives (#75). */
export const Coastlines = memo(function Coastlines({
  rotation,
  R,
  strokeColor,
  fillColor,
}: CoastlinesProps) {
  const [rings, setRings] = useState<Ring[] | null>(landRingsNow)
  useEffect(() => {
    if (rings) return
    let mounted = true
    void landRings().then((r) => {
      if (mounted) setRings(r)
    })
    return () => {
      mounted = false
    }
  }, [rings])

  const coastData = useMemo(
    () => (rings ?? []).map((ring) => coastPathData(ring, rotation, R)).filter((x) => x.d !== ''),
    [rings, rotation, R],
  )
  return (
    <g stroke={strokeColor} strokeWidth="0.5" opacity="0.95">
      {coastData.map((item, i) => (
        <path
          key={`land${i}`}
          d={item.d}
          fill={item.full ? fillColor : 'none'}
          strokeWidth={item.full ? '0.4' : '0.8'}
        />
      ))}
    </g>
  )
})
