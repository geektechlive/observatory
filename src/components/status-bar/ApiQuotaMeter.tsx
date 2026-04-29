import { useUiStore } from '@/store/ui'
import styles from './api-quota-meter.module.css'

const NASA_QUOTA_LIMIT = 1000

function accentClass(remaining: number): string {
  if (remaining >= 500) return styles.good ?? ''
  if (remaining >= 200) return styles.caution ?? ''
  return styles.low ?? ''
}

export function ApiQuotaMeter() {
  const quotaRemaining = useUiStore((s) => s.quotaRemaining)

  if (quotaRemaining === null) return null

  const ratio = Math.max(0, Math.min(1, quotaRemaining / NASA_QUOTA_LIMIT))

  return (
    <div
      className={styles.meter}
      title={`NASA API quota: ${quotaRemaining.toString()} / ${NASA_QUOTA_LIMIT.toString()} requests remaining this hour`}
    >
      <span className={`${styles.label ?? ''} ${accentClass(quotaRemaining)}`}>
        {quotaRemaining}
        <span className={styles.unit ?? ''}>/hr</span>
      </span>
      <div className={styles.track ?? ''} aria-hidden="true">
        <div
          className={`${styles.fill ?? ''} ${accentClass(quotaRemaining)}`}
          style={{ width: `${(ratio * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  )
}
