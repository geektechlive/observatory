import { useTicker } from '@/hooks/useTicker'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { TickerItem } from './TickerItem'
import styles from './ticker.module.css'

export function Ticker() {
  const items = useTicker()
  const reducedMotion = useReducedMotion()

  // For reduced motion: show first 8 items statically
  // For normal: render items twice for seamless loop
  const displayItems = reducedMotion ? items.slice(0, 8) : items

  return (
    <div className={styles.ticker ?? ''} role="region" aria-label="Live event feed">
      <div className={styles.liveChip ?? ''}>
        <span className={styles.liveDot ?? ''} aria-hidden="true" />
        <span>Live</span>
      </div>

      <div className={styles.track ?? ''}>
        <div className={styles.inner ?? ''}>
          {displayItems.map((item) => (
            <TickerItem key={item.id} item={item} />
          ))}
          {/* Duplicate for seamless loop — hidden from screen readers */}
          {!reducedMotion &&
            displayItems.map((item) => <TickerItem key={`${item.id}-dup`} item={item} />)}
        </div>
      </div>
    </div>
  )
}
