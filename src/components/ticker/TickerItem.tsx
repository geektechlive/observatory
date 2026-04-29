import type { TickerItem as TickerItemData } from '@/hooks/useTicker'
import { formatRelativeTime } from '@/lib/format'
import styles from './ticker.module.css'

interface TickerItemProps {
  item: TickerItemData
}

export function TickerItem({ item }: TickerItemProps) {
  const timeStr = item.time.getTime() > 0 ? formatRelativeTime(item.time.toISOString()) : ''

  return (
    <span className={styles.itemWrap ?? ''}>
      <span className={styles.dot ?? ''} aria-hidden="true" style={{ background: item.color }} />
      <span className={styles.label ?? ''} style={{ color: item.color }}>
        {item.label}
      </span>
      <span className={styles.description ?? ''}>{item.description}</span>
      {timeStr && <span className={styles.time ?? ''}>{timeStr}</span>}
      <span className={styles.separator ?? ''} aria-hidden="true" />
    </span>
  )
}
