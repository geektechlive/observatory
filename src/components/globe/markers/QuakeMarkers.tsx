import { memo } from 'react'

import { LANES } from '@/lib/palette'

import { useProjected } from '../useGlobeProjection'

export interface GlobeQuake {
  lat: number
  lon: number
  mag: number | null
  place: string
}

/**
 * Hollow rings in the geophysical lane. Magnitude is shown by size only, never by
 * colour within a lane (spec section 4); a null magnitude draws faint.
 */
function quakeColor(mag: number | null): string {
  return mag === null ? 'var(--bone-faint)' : LANES.geo.emit
}

function quakeRadius(mag: number | null): number {
  const m = mag ?? 2.5
  return Math.min(7, Math.max(1.6, 1.2 + (m - 2) * 0.9))
}

interface QuakeMarkersProps {
  quakes: readonly GlobeQuake[]
  rotation: number
  R: number
}

export const QuakeMarkers = memo(function QuakeMarkers({ quakes, rotation, R }: QuakeMarkersProps) {
  const projected = useProjected(quakes, rotation, R)
  return (
    <>
      {projected.map(({ point: q, index, x, y }) => {
        const c = quakeColor(q.mag)
        const r = quakeRadius(q.mag)
        return (
          <g key={`q${index}`} pointerEvents="none">
            <title>
              M{q.mag?.toFixed(1) ?? '?'} — {q.place}
            </title>
            <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth="1.1" opacity="0.85" />
            <circle cx={x} cy={y} r={0.8} fill={c} opacity="0.9" />
          </g>
        )
      })}
    </>
  )
})
