import { memo } from 'react'

import { useProjected } from '../useGlobeProjection'

export interface GlobeLaunch {
  lat: number
  lon: number
  name: string
}

const LAUNCH_COLOR = 'oklch(0.84 0.16 80)'
const PAD_HEIGHT = 9
const PAD_HALF_WIDTH = 6

interface LaunchPadMarkersProps {
  launches: readonly GlobeLaunch[]
  rotation: number
  R: number
}

export const LaunchPadMarkers = memo(function LaunchPadMarkers({
  launches,
  rotation,
  R,
}: LaunchPadMarkersProps) {
  const projected = useProjected(launches, rotation, R)
  return (
    <>
      {projected.map(({ point: lp, index, x, y }) => (
        <g key={index}>
          <title>Launch pad: {lp.name}</title>
          <polygon
            points={`${x},${y - PAD_HEIGHT} ${x - PAD_HALF_WIDTH},${y + 4} ${x + PAD_HALF_WIDTH},${y + 4}`}
            fill={LAUNCH_COLOR}
            stroke="oklch(0.08 0.01 50)"
            strokeWidth="0.6"
            opacity="0.9"
          />
        </g>
      ))}
    </>
  )
})
