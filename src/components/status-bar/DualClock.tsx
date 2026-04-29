import { useEffect, useRef, useState } from 'react'
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
  const rafRef = useRef<number | null>(null)
  const lastSecRef = useRef(-1)

  useEffect(() => {
    function tick() {
      const d = new Date()
      if (d.getSeconds() !== lastSecRef.current) {
        lastSecRef.current = d.getSeconds()
        setNow(d)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const utc = formatTime(now, 'UTC')
  const local = formatTime(now, Intl.DateTimeFormat().resolvedOptions().timeZone)
  const localTz = getTzAbbr(now, Intl.DateTimeFormat().resolvedOptions().timeZone)
  const isoLabel = now.toISOString()

  return (
    <div className={clockStyles.root} aria-label={`Clocks: UTC ${utc}, local ${local}`}>
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
