import { memo } from 'react'

import { useProjected } from '../useGlobeProjection'

/** NASA Deep Space Network ground stations. */
const DSN_STATIONS: { name: string; lat: number; lon: number }[] = [
  { name: 'GOLDSTONE', lat: 35.43, lon: -116.89 },
  { name: 'MADRID', lat: 40.43, lon: -4.25 },
  { name: 'CANBERRA', lat: -35.4, lon: 148.98 },
]

interface StationMarkersProps {
  rotation: number
  R: number
  color: string
}

/** DSN ground stations — shown in ORBIT "tracking station" mode. */
export const StationMarkers = memo(function StationMarkers({
  rotation,
  R,
  color,
}: StationMarkersProps) {
  const projected = useProjected(DSN_STATIONS, rotation, R)
  return (
    <>
      {projected.map(({ point: st, index, x, y }) => (
        <g key={`dsn${index}`} pointerEvents="none">
          <title>DSN · {st.name}</title>
          <circle cx={x} cy={y} r={6} fill="none" stroke={color} strokeWidth="0.7" opacity="0.5">
            <animate
              attributeName="r"
              values="4;11;4"
              dur="3s"
              begin={`${index * 0.7}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.7;0;0.7"
              dur="3s"
              begin={`${index * 0.7}s`}
              repeatCount="indefinite"
            />
          </circle>
          <path
            d={`M${x},${(y - 5).toFixed(1)} L${(x + 4).toFixed(1)},${(y + 3).toFixed(1)} L${(x - 4).toFixed(1)},${(y + 3).toFixed(1)} Z`}
            fill={color}
            opacity="0.9"
          />
          <text
            x={x + 8}
            y={y + 2.5}
            fill={color}
            fontSize="6"
            fontFamily="var(--font-stencil)"
            letterSpacing="0.1em"
            opacity="0.8"
            aria-hidden="true"
          >
            {st.name}
          </text>
        </g>
      ))}
    </>
  )
})
