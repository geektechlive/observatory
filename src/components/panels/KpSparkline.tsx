import { Sparkline } from '@/components/ui/Sparkline'
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

  return (
    <div className={styles.section ?? ''}>
      <div className={styles.header ?? ''}>
        <span className={styles.label ?? ''}>Kp Index</span>
        <span className={styles.maxValue ?? ''} style={{ color: barColor(maxKp) }}>
          {maxKp}
        </span>
      </div>
      <Sparkline
        values={sorted.map((r) => r.kpIndex)}
        mode="bars"
        min={0}
        max={9}
        color={barColor}
        ariaLabel={`Kp index sparkline, max ${maxKp}`}
      />
    </div>
  )
}
