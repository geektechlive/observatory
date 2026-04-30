import { useLayoutEffect, useRef, useState } from 'react'
import { useTicker } from '@/hooks/useTicker'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useUiStore } from '@/store/ui'
import { TickerItem } from './TickerItem'
import styles from './ticker.module.css'

const TICKER_SPEED_PX_PER_S = 160

export function Ticker() {
  const items = useTicker()
  const reducedMotion = useReducedMotion()
  const tickerPaused = useUiStore((s) => s.tickerPaused)
  const setTickerPaused = useUiStore((s) => s.setTickerPaused)
  const setSelectedEventId = useUiStore((s) => s.setSelectedEventId)

  const displayItems = reducedMotion ? items.slice(0, 8) : items

  const innerRef = useRef<HTMLDivElement>(null)
  const [tickerDuration, setTickerDuration] = useState(60)

  useLayoutEffect(() => {
    if (!innerRef.current) return
    const width = innerRef.current.scrollWidth
    if (width === 0) return
    // Animation scrolls -50% of total width; derive duration from target speed
    const duration = (width * 0.5) / TICKER_SPEED_PX_PER_S
    setTickerDuration(Math.max(15, duration))
  }, [displayItems.length])

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
            ref={innerRef}
            className={styles.inner ?? ''}
            style={
              {
                '--ticker-duration': `${tickerDuration.toFixed(1)}s`,
                animationPlayState: tickerPaused ? 'paused' : undefined,
              } as React.CSSProperties
            }
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
