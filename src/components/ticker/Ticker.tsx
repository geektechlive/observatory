import { useLayoutEffect, useRef, useState } from 'react'

import { useReducedMotion } from '@/hooks/useReducedMotion'
import { type TickerItem as TickerItemData, useTicker } from '@/hooks/useTicker'
import { useUiStore } from '@/store/ui'

import { keepArrivalOrder } from './arrivalOrder'
import styles from './ticker.module.css'
import { TickerItem } from './TickerItem'
import { useFirstFillReady } from './useFirstFillReady'

const TICKER_SPEED_PX_PER_S = 160

/**
 * The live items, kept as state derived during render: the first fill in useTicker's
 * order, then anything new joins the end, where it moves nothing already showing (#175).
 */
function useArrivalOrder(items: TickerItemData[]): TickerItemData[] {
  const [order, setOrder] = useState<readonly string[]>([])
  const ordered = keepArrivalOrder(order, items)
  const ids = ordered.map((item) => item.id)
  if (ids.join('\n') !== order.join('\n')) setOrder(ids)
  return ordered
}

const NO_ITEMS: TickerItemData[] = []

export function Ticker() {
  const live = useTicker()
  const reducedMotion = useReducedMotion()
  const items = useArrivalOrder(useFirstFillReady(reducedMotion) ? live : NO_ITEMS)
  const tickerPaused = useUiStore((s) => s.tickerPaused)
  const setTickerPaused = useUiStore((s) => s.setTickerPaused)
  const setSelectedEventId = useUiStore((s) => s.setSelectedEventId)

  const displayItems = reducedMotion ? items.slice(0, 8) : items

  const stripRef = useRef<HTMLDivElement>(null)
  const [tickerDuration, setTickerDuration] = useState(60)

  useLayoutEffect(() => {
    if (!stripRef.current) return
    const width = stripRef.current.offsetWidth
    if (width === 0) return
    // The animation scrolls one strip's width; derive the duration from the target speed.
    const duration = width / TICKER_SPEED_PX_PER_S
    setTickerDuration(Math.max(15, duration))
  }, [displayItems.length])

  const strip = displayItems.map((item) => (
    <TickerItem
      key={item.id}
      item={item}
      onClick={
        item.id.startsWith('eonet-')
          ? () => {
              setSelectedEventId(item.id)
            }
          : undefined
      }
    />
  ))

  return (
    <div className={styles.ticker ?? ''} role="region" aria-label="Live event feed">
      <button
        type="button"
        className={styles.liveChip ?? ''}
        aria-pressed={tickerPaused}
        aria-label={tickerPaused ? 'Resume ticker' : 'Pause ticker'}
        onClick={() => {
          setTickerPaused(!tickerPaused)
        }}
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
            style={
              {
                '--ticker-duration': `${tickerDuration.toFixed(1)}s`,
                animationPlayState: tickerPaused ? 'paused' : undefined,
              } as React.CSSProperties
            }
          >
            <div ref={stripRef} className={styles.strip ?? ''}>
              {strip}
            </div>
            {/* The copy that makes the loop seamless. It sits one strip along by a
                transform, not by layout, so an item joining the strip never moves it
                (#175), and it repeats the strip's own markup so the two are the same
                width. Inert: hidden from screen readers and out of the tab order. */}
            {!reducedMotion && (
              <div
                className={`${styles.strip ?? ''} ${styles.loopCopy ?? ''}`}
                aria-hidden="true"
                inert
              >
                {strip}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
