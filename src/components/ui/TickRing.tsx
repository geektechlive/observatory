import styles from './primitives.module.css'

interface TickRingProps {
  /** Rendered diameter in px. */
  size: number
  /** Degrees between ticks. */
  step?: number | undefined
  /** Every tick on a multiple of this is a major (longer, copper-glow) tick. */
  major?: number | undefined
  /** Minor tick length as a fraction of the radius. */
  length?: number | undefined
}

/**
 * The engraved tick ring shared by the OrbitalDial and the globe bezel, so the nav
 * and the lens read as machined by the same shop (spec section 5).
 */
export function TickRing({ size, step = 5, major = 30, length = 0.06 }: TickRingProps) {
  const r = size / 2
  const ticks = Array.from({ length: Math.round(360 / step) }, (_, i) => i * step)
  return (
    <svg
      className={styles.tickRing ?? ''}
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      aria-hidden="true"
    >
      {ticks.map((deg) => {
        const isMajor = deg % major === 0
        const inner = r * (1 - length * (isMajor ? 2 : 1))
        const a = (deg * Math.PI) / 180
        const s = Math.sin(a)
        const c = Math.cos(a)
        return (
          <line
            key={deg}
            data-tick={isMajor ? 'major' : 'minor'}
            className={(isMajor ? styles.tickMajor : styles.tickMinor) ?? ''}
            x1={r + r * s}
            y1={r - r * c}
            x2={r + inner * s}
            y2={r - inner * c}
            strokeWidth={isMajor ? 1.4 : 1}
          />
        )
      })}
    </svg>
  )
}
