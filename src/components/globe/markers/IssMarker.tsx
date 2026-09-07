import { memo } from 'react'

interface IssMarkerProps {
  /** Projected ISS position in globe-local coordinates, or null when unknown. */
  dot: { x: number; y: number; visible: boolean } | null
  color: string
}

/** ISS tactical crosshair marker plus its callsign label. */
export const IssMarker = memo(function IssMarker({ dot, color }: IssMarkerProps) {
  if (dot === null || !dot.visible) return null
  return (
    <>
      <g transform={`translate(${dot.x} ${dot.y})`} filter="url(#iss-glow)">
        {/* Outer ring */}
        <circle r={9} fill="none" stroke={color} strokeWidth="1.5" />
        {/* Gap crosshair — 4 lines not touching center */}
        <line x1={-16} y1={0} x2={-11} y2={0} stroke={color} strokeWidth="1.2" />
        <line x1={11} y1={0} x2={16} y2={0} stroke={color} strokeWidth="1.2" />
        <line x1={0} y1={-16} x2={0} y2={-11} stroke={color} strokeWidth="1.2" />
        <line x1={0} y1={11} x2={0} y2={16} stroke={color} strokeWidth="1.2" />
        {/* Center dot */}
        <circle r={2.5} fill={color} />
        {/* Pulsing acquisition ring */}
        <circle r="14" fill="none" stroke={color} strokeWidth="0.6" opacity="0">
          <animate attributeName="r" values="12;24;12" dur="2.4s" repeatCount="indefinite" />
          <animate
            attributeName="opacity"
            values="0.75;0;0.75"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </circle>
      </g>
      <text
        x={dot.x + 18}
        y={dot.y - 10}
        fill={color}
        fontSize="10"
        fontFamily="var(--font-stencil)"
        letterSpacing="0.12em"
        opacity="0.9"
        pointerEvents="none"
        aria-hidden="true"
      >
        ISS-1
      </text>
    </>
  )
})
