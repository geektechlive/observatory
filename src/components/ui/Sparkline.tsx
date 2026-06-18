import styles from './sparkline.module.css'

export interface SparklineThreshold {
  value: number
  color?: string | undefined
}

export interface SparklineProps {
  /** Ordered series, oldest → newest. */
  values: number[]
  mode?: 'bars' | 'line'
  width?: number
  height?: number
  /** Single color, or a function mapping a value to a color (per-bar in bar mode). */
  color?: string | ((value: number) => string)
  /** Domain floor. Defaults to 0 (linear) or the series min (log). */
  min?: number | undefined
  /** Domain ceiling. Defaults to the series max. */
  max?: number | undefined
  scale?: 'linear' | 'log'
  /** Value bars/area originate from. Defaults to `min`. Use 0 for signed series (e.g. IMF Bz). */
  baseline?: number | undefined
  /** Horizontal reference lines, e.g. B/C/M/X flare-class bands. */
  thresholds?: SparklineThreshold[]
  /** Fill the area under a line (line mode only). */
  fill?: boolean
  ariaLabel?: string
  className?: string | undefined
}

const DEFAULT_COLOR = 'var(--signal)'

function resolveColor(color: SparklineProps['color'], value: number): string {
  if (typeof color === 'function') return color(value)
  return color ?? DEFAULT_COLOR
}

/**
 * Minimal custom-SVG sparkline — bars or line, linear or log scale, optional
 * threshold bands. Deliberately dependency-free to match the dashboard's
 * zero-chart-library aesthetic and bundle budget. The caller owns labels/headers.
 */
export function Sparkline({
  values,
  mode = 'bars',
  width = 200,
  height = 36,
  color,
  min,
  max,
  scale = 'linear',
  baseline,
  thresholds = [],
  fill = false,
  ariaLabel,
  className,
}: SparklineProps) {
  if (values.length === 0) return null

  const seriesMin = Math.min(...values)
  const seriesMax = Math.max(...values)
  const isLog = scale === 'log'

  // Domain floor: for log we need a strictly positive floor.
  const domainMin = min ?? (isLog ? Math.max(seriesMin, Number.MIN_VALUE) : Math.min(0, seriesMin))
  const domainMax = max ?? seriesMax
  const span = domainMax - domainMin || 1

  const norm = (v: number): number => {
    if (isLog) {
      const lo = Math.log10(Math.max(domainMin, Number.MIN_VALUE))
      const hi = Math.log10(Math.max(domainMax, Number.MIN_VALUE))
      const lv = Math.log10(Math.max(v, Number.MIN_VALUE))
      const t = (lv - lo) / (hi - lo || 1)
      return Math.min(1, Math.max(0, t))
    }
    const t = (v - domainMin) / span
    return Math.min(1, Math.max(0, t))
  }

  // SVG y grows downward; flip so larger values sit higher.
  const yOf = (v: number): number => height - norm(v) * height

  const baseValue = baseline ?? domainMin
  const yBase = yOf(baseValue)

  const n = values.length

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`${styles.svg ?? ''} ${className ?? ''}`.trim()}
      style={{ height: `${height}px` }}
      aria-label={ariaLabel ?? 'sparkline'}
      role="img"
      preserveAspectRatio="none"
    >
      {thresholds.map((t) => {
        const y = yOf(t.value)
        return (
          <line
            key={`th-${t.value}`}
            x1={0}
            x2={width}
            y1={y}
            y2={y}
            stroke={t.color ?? 'var(--ink-faint)'}
            strokeWidth={0.5}
            strokeDasharray="2 3"
            opacity={0.5}
          />
        )
      })}

      {mode === 'bars'
        ? values.map((v, i) => {
            const gap = 2
            const barW = Math.max(1, (width - gap * (n - 1)) / n)
            const x = i * (barW + gap)
            const y = yOf(v)
            const top = Math.min(y, yBase)
            const h = Math.max(1, Math.abs(y - yBase))
            return (
              <rect
                key={i}
                x={x}
                y={top}
                width={barW}
                height={h}
                fill={resolveColor(color, v)}
                opacity={0.7}
                rx={1}
              />
            )
          })
        : (() => {
            const xOf = (i: number): number => (n === 1 ? width / 2 : (i / (n - 1)) * width)
            const pts = values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')
            const lineColor = resolveColor(color, values[n - 1] ?? 0)
            return (
              <>
                {fill && (
                  <polygon
                    points={`0,${yBase} ${pts} ${width},${yBase}`}
                    fill={lineColor}
                    opacity={0.12}
                  />
                )}
                <polyline
                  points={pts}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.85}
                />
              </>
            )
          })()}
    </svg>
  )
}
