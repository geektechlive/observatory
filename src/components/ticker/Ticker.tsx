import { useTicker } from '@/hooks/useTicker'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useUiStore } from '@/store/ui'
import { TickerItem } from './TickerItem'
import styles from './ticker.module.css'

export function Ticker() {
  const items = useTicker()
  const reducedMotion = useReducedMotion()
  const tickerPaused = useUiStore((s) => s.tickerPaused)
  const setTickerPaused = useUiStore((s) => s.setTickerPaused)
  const setSelectedEventId = useUiStore((s) => s.setSelectedEventId)

  const displayItems = reducedMotion ? items.slice(0, 8) : items

  return (
    <div className={styles.ticker ?? ''} role="region" aria-label="Live event feed">
      <button
        type="button"
        className={styles.liveChip ?? ''}
        aria-pressed={tickerPaused}
        aria-label={tickerPaused ? 'Resume ticker' : 'Pause ticker'}
        onClick={() => setTickerPaused(!tickerPaused)}
      >
        <span
          className={styles.liveDot ?? ''}
          style={{ animationPlayState: tickerPaused ? 'paused' : undefined }}
          aria-hidden="true"
        />
        <span>{tickerPaused ? 'Paused' : 'Live'}</span>
      </button>

      <div className={styles.track ?? ''}>
        {displayItems.length === 0 ? (
          <span className={styles.empty ?? ''}>Awaiting telemetry…</span>
        ) : (
          <div
            className={styles.inner ?? ''}
            style={{ animationPlayState: tickerPaused ? 'paused' : undefined }}
          >
            {displayItems.map((item) => (
              <TickerItem
                key={item.id}
                item={item}
                onClick={
                  item.id.startsWith('eonet-') ? () => setSelectedEventId(item.id) : undefined
                }
              />
            ))}
            {/* Duplicate for seamless loop — hidden from screen readers */}
            {!reducedMotion &&
              displayItems.map((item) => (
                <TickerItem key={`${item.id}-dup`} item={item} aria-hidden={true} />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
