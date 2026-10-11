import { Swatch } from '@/components/ui/Swatch'
import type { TickerItem as TickerItemData } from '@/hooks/useTicker'
import { formatRelativeTime } from '@/lib/format'

import styles from './ticker.module.css'

interface TickerItemProps {
  item: TickerItemData
  'aria-hidden'?: true
  onClick?: (() => void) | undefined
}

/**
 * One ticker entry. Identity (lane or status colour) sits on the swatch; the label is
 * ink, never the series colour. An entry with an action is a real button.
 */
export function TickerItem({ item, 'aria-hidden': ariaHidden, onClick }: TickerItemProps) {
  const timeStr = item.time.getTime() > 0 ? formatRelativeTime(item.time.toISOString()) : ''
  const body = (
    <>
      <Swatch color={item.color} />
      <span className={styles.label ?? ''}>{item.label}</span>
      <span className={styles.description ?? ''}>{item.description}</span>
      {timeStr && <span className={styles.time ?? ''}>{timeStr}</span>}
    </>
  )

  if (onClick) {
    return (
      <span aria-hidden={ariaHidden}>
        <button
          type="button"
          className={`${styles.itemWrap ?? ''} ${styles.itemClickable ?? ''}`}
          onClick={onClick}
          aria-label={`${item.label}: ${item.description}. Show on the map`}
        >
          {body}
        </button>
        <span className={styles.separator ?? ''} aria-hidden="true" />
      </span>
    )
  }

  return (
    <span className={styles.itemWrap ?? ''} aria-hidden={ariaHidden}>
      {body}
      <span className={styles.separator ?? ''} aria-hidden="true" />
    </span>
  )
}
