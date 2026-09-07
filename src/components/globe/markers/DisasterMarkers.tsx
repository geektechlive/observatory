import { memo } from 'react'

import { useProjected } from '../useGlobeProjection'

export interface GlobeDisaster {
  lat: number
  lon: number
  type: string
  alert: string
  name: string
}

/** GDACS disaster alerts: diamond glyphs colored by alert level. */
function alertColor(alert: string): string {
  if (alert === 'Red') return 'oklch(0.62 0.22 25)'
  return 'oklch(0.78 0.18 55)' // Orange
}

const DISASTER_LETTER: Record<string, string> = {
  EQ: 'E',
  TC: 'C',
  FL: 'W',
  VO: 'V',
  WF: 'F',
  DR: 'D',
}

const DIAMOND_HALF = 5

interface DisasterMarkersProps {
  disasters: readonly GlobeDisaster[]
  rotation: number
  R: number
}

export const DisasterMarkers = memo(function DisasterMarkers({
  disasters,
  rotation,
  R,
}: DisasterMarkersProps) {
  const projected = useProjected(disasters, rotation, R)
  return (
    <>
      {projected.map(({ point: dz, index, x, y }) => {
        const c = alertColor(dz.alert)
        const s = DIAMOND_HALF
        const letter = DISASTER_LETTER[dz.type] ?? '!'
        return (
          <g key={`dz${index}`} pointerEvents="none">
            <title>
              {dz.alert} alert — {dz.name}
            </title>
            <path
              d={`M${x},${(y - s).toFixed(1)} L${(x + s).toFixed(1)},${y} L${x},${(y + s).toFixed(1)} L${(x - s).toFixed(1)},${y} Z`}
              fill={c}
              stroke="oklch(0.08 0.01 50)"
              strokeWidth="0.5"
              opacity="0.95"
            />
            <text
              x={x}
              y={y + 2}
              textAnchor="middle"
              fill="oklch(0.08 0.01 50)"
              fontSize="4.5"
              fontFamily="var(--font-stencil)"
              fontWeight="700"
              aria-hidden="true"
            >
              {letter}
            </text>
          </g>
        )
      })}
    </>
  )
})
