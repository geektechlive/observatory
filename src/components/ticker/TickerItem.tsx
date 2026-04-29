import type { TickerItem as TickerItemData } from '@/hooks/useTicker'
import { formatRelativeTime } from '@/lib/format'
import styles from './ticker.module.css'

interface TickerItemProps {
  item: TickerItemData
  'aria-hidden'?: true
  onClick?: (() => void) | undefined
}

export function TickerItem({ item, 'aria-hidden': ariaHidden, onClick }: TickerItemProps) {
  const timeStr = item.time.getTime() > 0 ? formatRelativeTime(item.time.toISOString()) : ''

  const handleKey = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <span
      className={`${styles.itemWrap ?? ''}${onClick ? ` ${styles.itemClickable ?? ''}` : ''}`}
      aria-hidden={ariaHidden}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? handleKey : undefined}
    >
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
