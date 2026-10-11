import { useEffect, useState } from 'react'

import clockStyles from './dual-clock.module.css'

function formatTime(date: Date, timeZone: string) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
  })
}

function getTzAbbr(date: Date, timeZone: string) {
  return (
    date.toLocaleDateString('en-US', { timeZone, timeZoneName: 'short' }).split(', ')[1] ?? timeZone
  )
}

export function DualClock() {
  const [now, setNow] = useState(() => new Date())

  // Tick on the second boundary. The old version polled every animation frame
  // (60 Hz) just to notice the second had changed.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const align = setTimeout(
      () => {
        setNow(new Date())
        interval = setInterval(() => {
          setNow(new Date())
        }, 1000)
      },
      1000 - (Date.now() % 1000),
    )
    return () => {
      clearTimeout(align)
      if (interval) clearInterval(interval)
    }
  }, [])

  const utc = formatTime(now, 'UTC')
  const local = formatTime(now, Intl.DateTimeFormat().resolvedOptions().timeZone)
  const localTz = getTzAbbr(now, Intl.DateTimeFormat().resolvedOptions().timeZone)
  const isoLabel = now.toISOString()

  return (
    <div
      className={clockStyles.root}
      role="group"
      aria-label={`Clocks: UTC ${utc}, local ${local}`}
    >
      <time dateTime={isoLabel} className={clockStyles.clock}>
        <span className={clockStyles.tz}>UTC</span>
        <span className={clockStyles.time}>{utc}</span>
      </time>
      <span className={clockStyles.sep}>·</span>
      <time dateTime={isoLabel} className={clockStyles.clock}>
        <span className={clockStyles.tz}>{localTz}</span>
        <span className={clockStyles.time}>{local}</span>
      </time>
    </div>
  )
}
