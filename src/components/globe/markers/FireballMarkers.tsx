import { memo } from 'react'

import { useProjected } from '../useGlobeProjection'

export interface GlobeFireball {
  lat: number
  lon: number
  /** Total radiated energy, kilotons. */
  energy: number
}

const FIREBALL_COLOR = 'oklch(0.88 0.18 60)'

/** 4-point sparkle path centered at (cx, cy), radius r. */
function sparklePath(cx: number, cy: number, r: number): string {
  const i = r * 0.34
  return (
    `M${cx},${(cy - r).toFixed(1)} L${(cx + i).toFixed(1)},${(cy - i).toFixed(1)} ` +
    `L${(cx + r).toFixed(1)},${cy} L${(cx + i).toFixed(1)},${(cy + i).toFixed(1)} ` +
    `L${cx},${(cy + r).toFixed(1)} L${(cx - i).toFixed(1)},${(cy + i).toFixed(1)} ` +
    `L${(cx - r).toFixed(1)},${cy} L${(cx - i).toFixed(1)},${(cy - i).toFixed(1)} Z`
  )
}

interface FireballMarkersProps {
  fireballs: readonly GlobeFireball[]
  rotation: number
  R: number
  glowFilter: string
}

export const FireballMarkers = memo(function FireballMarkers({
  fireballs,
  rotation,
  R,
  glowFilter,
}: FireballMarkersProps) {
  const projected = useProjected(fireballs, rotation, R)
  return (
    <>
      {projected.map(({ point: fb, index, x, y }) => {
        const r = Math.min(8, Math.max(3, 3 + Math.sqrt(Math.max(0, fb.energy)) * 1.1))
        return (
          <g key={`fb${index}`} pointerEvents="none">
            <title>
              Fireball — {fb.energy.toFixed(1)} kt · {fb.lat.toFixed(1)}° {fb.lon.toFixed(1)}°
            </title>
            <path
              d={sparklePath(x, y, r)}
              fill={FIREBALL_COLOR}
              opacity="0.9"
              filter={glowFilter}
            />
            <path d={sparklePath(x, y, r * 0.5)} fill="oklch(0.98 0.04 90)" opacity="0.95" />
          </g>
        )
      })}
    </>
  )
})
