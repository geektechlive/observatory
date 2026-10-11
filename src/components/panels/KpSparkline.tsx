import { Sparkline } from '@/components/ui/Sparkline'
import { kpStatus, statusVar } from '@/lib/severity'

import styles from './kp-sparkline.module.css'

interface Reading {
  observedTime: string
  kpIndex: number
}

interface Props {
  readings: Reading[]
}

const barColor = (kp: number): string => statusVar(kpStatus(kp))

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
