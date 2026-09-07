import { memo } from 'react'

import { useProjected } from '../useGlobeProjection'

export interface GlobeSatellite {
  name: string
  lat: number
  lon: number
}

const SAT_COLOR = 'oklch(0.78 0.18 145)'

interface SatelliteMarkersProps {
  satellites: readonly GlobeSatellite[]
  rotation: number
  R: number
}

/** Other tracked satellites (Hubble, Tiangong). */
export const SatelliteMarkers = memo(function SatelliteMarkers({
  satellites,
  rotation,
  R,
}: SatelliteMarkersProps) {
  const projected = useProjected(satellites, rotation, R)
  return (
    <>
      {projected.map(({ point: sat, index, x, y }) => (
        <g key={`sat${index}`} pointerEvents="none">
          <title>{sat.name}</title>
          <circle cx={x} cy={y} r={3.4} fill="none" stroke={SAT_COLOR} strokeWidth="1" />
          <circle cx={x} cy={y} r={1.4} fill={SAT_COLOR} />
          <text
            x={x + 5}
            y={y + 2.5}
            fill={SAT_COLOR}
            fontSize="6.5"
            fontFamily="var(--font-stencil)"
            letterSpacing="0.06em"
            opacity="0.85"
            aria-hidden="true"
          >
            {sat.name}
          </text>
        </g>
      ))}
    </>
  )
})
