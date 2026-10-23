import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { Sparkline } from '@/components/ui/Sparkline'
import { kpStatus, statusVar } from '@/lib/severity'

import styles from './kp-sparkline.module.css'

interface Reading {
  observedTime: string
  kpIndex: number
}

interface Props {
  readings: Reading[]
  /**
   * The "Kp Index" label and peak readout. Off where the panel already shows the
   * current Kp large (#63): a second, different number beside it read as a contradiction.
   */
  showHeader?: boolean
}

const barColor = (kp: number): string => statusVar(kpStatus(kp))

export function KpSparkline({ readings, showHeader = true }: Props) {
  if (readings.length === 0) return null

  const sorted = [...readings].sort(
    (a, b) => new Date(a.observedTime).getTime() - new Date(b.observedTime).getTime(),
  )

  const maxKp = Math.max(...sorted.map((r) => r.kpIndex))

  return (
    <div className={styles.section ?? ''}>
      {showHeader && (
        <div className={styles.header ?? ''}>
          <Label>Kp Index</Label>
          <Readout value={String(maxKp)} tone={kpStatus(maxKp)} className={styles.maxValue ?? ''} />
        </div>
      )}
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
