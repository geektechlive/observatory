import styles from './kp-sparkline.module.css'

interface Reading {
  observedTime: string
  kpIndex: number
}

interface Props {
  readings: Reading[]
}

function barColor(kp: number): string {
  if (kp >= 6) return 'var(--magenta)'
  if (kp >= 4) return 'var(--amber)'
  return 'var(--cyan)'
}

export function KpSparkline({ readings }: Props) {
  if (readings.length === 0) return null

  const sorted = [...readings].sort(
    (a, b) => new Date(a.observedTime).getTime() - new Date(b.observedTime).getTime(),
  )

  const maxKp = Math.max(...sorted.map((r) => r.kpIndex))
  const n = sorted.length
  const W = 200
  const H = 36
  const gap = 2
  const barW = Math.max(2, (W - gap * (n - 1)) / n)

  return (
    <div className={styles.section ?? ''}>
      <div className={styles.header ?? ''}>
        <span className={styles.label ?? ''}>Kp Index</span>
        <span className={styles.maxValue ?? ''} style={{ color: barColor(maxKp) }}>
          {maxKp}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg ?? ''}
        aria-label={`Kp index sparkline, max ${maxKp}`}
        role="img"
        preserveAspectRatio="none"
      >
        {sorted.map((r, i) => {
          const h = Math.max(2, (r.kpIndex / 9) * H)
          const x = i * (barW + gap)
          const y = H - h
          return (
            <rect
              key={r.observedTime}
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={barColor(r.kpIndex)}
              opacity={0.7}
              rx={1}
            />
          )
        })}
      </svg>
    </div>
  )
}
