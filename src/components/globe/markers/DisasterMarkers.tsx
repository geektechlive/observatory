import { memo } from 'react'

import { gdacsColor, VOID_HEX } from '@/lib/palette'

import { useProjected } from '../useGlobeProjection'

export interface GlobeDisaster {
  lat: number
  lon: number
  type: string
  alert: string
  name: string
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

/** GDACS disaster alerts: diamond glyphs on the status scale, lettered by hazard type. */
export const DisasterMarkers = memo(function DisasterMarkers({
  disasters,
  rotation,
  R,
}: DisasterMarkersProps) {
  const projected = useProjected(disasters, rotation, R)
  return (
    <>
      {projected.map(({ point: dz, index, x, y }) => {
        const c = gdacsColor(dz.alert)
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
              stroke={VOID_HEX}
              strokeWidth="0.5"
              opacity="0.95"
            />
            <text
              x={x}
              y={y + 2}
              textAnchor="middle"
              fill={VOID_HEX}
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
