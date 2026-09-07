import { memo } from 'react'

const SWEEP_SECTORS: { a1: number; a2: number; opacity: number }[] = [
  { a1: 264, a2: 270, opacity: 0.22 },
  { a1: 258, a2: 264, opacity: 0.12 },
  { a1: 252, a2: 258, opacity: 0.06 },
  { a1: 246, a2: 252, opacity: 0.03 },
  { a1: 240, a2: 246, opacity: 0.01 },
]

interface RadarSweepProps {
  R: number
  clipPathId: string
  glowFilter: string
  reducedMotion: boolean
}

/** Pure-SVG radar sweep so `mix-blend-mode` composites correctly. */
export const RadarSweep = memo(function RadarSweep({
  R,
  clipPathId,
  glowFilter,
  reducedMotion,
}: RadarSweepProps) {
  return (
    <g clipPath={`url(#${clipPathId})`} style={{ mixBlendMode: 'screen' }}>
      {/* Range rings at 33% and 67% */}
      <circle
        r={R * 0.33}
        fill="none"
        stroke="oklch(0.85 0.13 220)"
        strokeWidth="0.5"
        opacity={0.1}
      />
      <circle
        r={R * 0.67}
        fill="none"
        stroke="oklch(0.85 0.13 220)"
        strokeWidth="0.5"
        opacity={0.1}
      />
      {/* Rotating sweep arm — SMIL rotate at globe center (0,0) */}
      <g>
        {!reducedMotion && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 0 0"
            to="360 0 0"
            dur="6s"
            repeatCount="indefinite"
          />
        )}
        {/* Fading trailing arc — opacity decays from lead edge to trailing edge */}
        {SWEEP_SECTORS.map(({ a1, a2, opacity }, i) => {
          const a1r = (a1 * Math.PI) / 180
          const a2r = (a2 * Math.PI) / 180
          const x1 = (Math.cos(a1r) * R).toFixed(1)
          const y1 = (Math.sin(a1r) * R).toFixed(1)
          const x2 = (Math.cos(a2r) * R).toFixed(1)
          const y2 = (Math.sin(a2r) * R).toFixed(1)
          return (
            <path
              key={i}
              d={`M 0 0 L ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} Z`}
              fill="oklch(0.85 0.13 220)"
              opacity={opacity}
            />
          )
        })}
        {/* Bright leading arm */}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-R}
          stroke="oklch(0.95 0.16 220)"
          strokeWidth="2"
          opacity={0.75}
          filter={glowFilter}
        />
      </g>
    </g>
  )
})
