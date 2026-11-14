import { useEffect, useState } from 'react'

import { PLAYBACK_RATES, simAtEdge, useOrreryClock } from '@/store/orreryClock'

import { GoToDate } from './GoToDate'
import styles from './orrery.module.css'
import { RATE_LABEL, RATE_SHORT } from './rateLabels'
import { DAY_MS, formatSimUtc, SCRUB_DAYS, scrubCentre } from './simDate'
import { useSimTime } from './useSimTime'

const WEEK = 7
/**
 * Elements where Space already does something, and the surfaces over the orrery (the guide
 * drawer, the detail view): Space there is theirs, not play/pause's.
 */
const SPACE_OWNERS =
  'input, textarea, select, button, a[href], [role="slider"], [role="button"], [role="tab"], [role="option"], [role="switch"], [contenteditable="true"], [data-space-owner]'

interface TimeBarProps {
  /** Injected so tests can pin "now". */
  now?: () => number
}

/**
 * The simulation clock's controls (#91, spec Part 7): Now, a UTC readout, a ±1-year
 * scrubber (arrows step a day, Shift a week), play/pause, four rates, and a date field
 * reaching 3000 BC – 3000 AD for the planets.
 */
export function TimeBar({ now = Date.now }: TimeBarProps) {
  const clock = useOrreryClock()
  const { sim } = useSimTime()
  const [centre, setCentre] = useState(now)
  // Move the window with the clock during render (React's "adjust state on a prop
  // change" pattern), so the thumb never draws pinned at an end first.
  const nextCentre = scrubCentre(centre, sim)
  if (nextCentre !== centre) setCentre(nextCentre)
  const offsetDays = Math.round((sim - nextCentre) / DAY_MS)

  // Past Table 2's window there are no valid planet elements: the clock stops there.
  const { playing, pause } = clock
  useEffect(() => {
    if (playing && simAtEdge(sim)) pause()
  }, [playing, pause, sim])

  // Space plays and pauses (#251), unless focus is on something Space already works:
  // typing, a button, a slider, a link or a select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      const t = e.target
      if (t instanceof Element && t.closest(SPACE_OWNERS)) return
      e.preventDefault()
      const c = useOrreryClock.getState()
      if (c.playing) c.pause()
      else c.play()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const setOffset = (days: number) => {
    clock.setSimTime(nextCentre + days * DAY_MS)
  }
  const step = (days: number) => {
    clock.step(days * DAY_MS)
  }

  return (
    <div className={styles.timeBar ?? ''} role="group" aria-label="Simulation time">
      <button
        type="button"
        className={styles.chipBtn ?? ''}
        onClick={() => {
          const t = now()
          clock.resetToNow(t)
          setCentre(t)
        }}
      >
        Now
      </button>
      <output className={styles.utc ?? ''} aria-live="off">
        {formatSimUtc(sim)}
      </output>
      <button
        type="button"
        className={styles.chipBtn ?? ''}
        aria-label={clock.playing ? 'Pause' : 'Play'}
        onClick={() => {
          if (clock.playing) clock.pause()
          else clock.play()
        }}
      >
        {clock.playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        className={styles.scrub ?? ''}
        aria-label="Date, days either side of the scrubber's centre"
        aria-valuetext={formatSimUtc(sim)}
        min={-SCRUB_DAYS}
        max={SCRUB_DAYS}
        step={1}
        value={Math.max(-SCRUB_DAYS, Math.min(SCRUB_DAYS, offsetDays))}
        onChange={(e) => {
          setOffset(Number(e.target.value))
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const dir = e.key === 'ArrowRight' ? 1 : -1
          step(dir * (e.shiftKey ? WEEK : 1))
        }}
      />
      <div className={styles.rates ?? ''} role="group" aria-label="Playback rate">
        {PLAYBACK_RATES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={clock.rate === r}
            aria-label={RATE_LABEL[r]}
            className={styles.rateBtn ?? ''}
            onClick={() => {
              clock.setRate(r)
              if (!clock.playing) clock.play()
            }}
          >
            {RATE_SHORT[r]}
          </button>
        ))}
      </div>
      <GoToDate className={styles.dateField} />
    </div>
  )
}
