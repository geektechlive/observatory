import { useEffect, useState } from 'react'

import styles from './data-age.module.css'

interface DataAgeProps {
  /** When the data is from, ms; 0 is unknown. Panels pass `panelView`'s `age`. */
  updatedAt: number
  /**
   * The last refetch failed and the panel is showing its last good answer (#222). The
   * stamp says so quietly, in the same faint type: the bezel's "stale" is the age in
   * `--bone-faint` (ROCI v2). It sits in the nameplate, so it never moves the panel.
   * Measured against every nameplate (#222): "couldn't refresh" fits each one from 390 px
   * up; below that, the longest ("Close Approaches · 7 days") leaves room only for "stale".
   */
  refreshFailed?: boolean | undefined
  /** The source's contract age. Once a failed panel's data is older, the age shows. */
  maxAgeMs?: number | undefined
}

const TICK_MS = 30_000

function formatAge(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function DataAge({ updatedAt, refreshFailed = false, maxAgeMs }: DataAgeProps) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const tick = () => {
      setNow(Date.now())
    }
    tick()
    const id = setInterval(tick, TICK_MS)
    return () => {
      clearInterval(id)
    }
  }, [updatedAt])

  const known = Number.isFinite(updatedAt) && updatedAt > 0
  if (!known && !refreshFailed) return null

  const ageMs = now - updatedAt
  const label = formatAge(ageMs)
  const time = known ? new Date(updatedAt).toLocaleTimeString() : ''

  if (!refreshFailed) {
    return (
      <span className={styles.age ?? ''} title={time}>
        {label}
      </span>
    )
  }

  // The mark replaces the age rather than joining it: "12m ago · couldn't refresh" ran
  // into the longer nameplates. Within the source's contract age the age is in the
  // tooltip and in hidden text for screen readers; past it, the age is the visible text,
  // since days-old data under a faint "couldn't refresh" reads as current.
  const overdue = known && maxAgeMs !== undefined && ageMs > maxAgeMs
  const hidden = overdue ? ", couldn't refresh" : known ? `, data from ${label}` : ''
  return (
    <span
      className={styles.age ?? ''}
      title={known ? `Couldn't refresh; data from ${time} (${label})` : "Couldn't refresh"}
    >
      <span className={styles.long ?? ''}>{overdue ? `${label} · stale` : "couldn't refresh"}</span>
      <span className={styles.short ?? ''}>{overdue ? label : 'stale'}</span>
      {hidden && <span className={styles.hidden ?? ''}>{hidden}</span>}
    </span>
  )
}
