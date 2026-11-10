import { useEffect, useState } from 'react'

import { Label } from '@/components/ui/Label'
import { PLAYBACK_RATES, simAtEdge, useOrreryClock } from '@/store/orreryClock'

import styles from './orrery.module.css'
import { DAY_MS, formatSimUtc, parseSimDate, SCRUB_DAYS, scrubCentre, toDateField } from './simDate'
import { useSimTime } from './useSimTime'

/** What each rate button shows: short, so seven fit one row (#114). Its name is RATE_LABEL. */
const RATE_SHORT: Record<(typeof PLAYBACK_RATES)[number], string> = {
  1: '1×',
  60: 'min/s',
  3600: 'h/s',
  86_400: 'day/s',
  604_800: 'wk/s',
  2_592_000: 'mo/s',
  31_536_000: 'yr/s',
}
const RATE_LABEL: Record<(typeof PLAYBACK_RATES)[number], string> = {
  1: '1×',
  60: '1 min/s',
  3600: '1 h/s',
  86_400: '1 day/s',
  604_800: '1 wk/s',
  2_592_000: '1 mo/s',
  31_536_000: '1 yr/s',
}
const WEEK = 7

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
  const [field, setField] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
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

  const setOffset = (days: number) => {
    clock.setSimTime(nextCentre + days * DAY_MS)
  }
  const step = (days: number) => {
    clock.step(days * DAY_MS)
  }

  const commitField = () => {
    if (field === null) return
    const ms = parseSimDate(field)
    if (ms === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setField(null)
    clock.setSimTime(ms)
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
      <label className={styles.dateField ?? ''}>
        <Label>Go to date</Label>
        <input
          type="text"
          inputMode="numeric"
          aria-label="Go to date (YYYY-MM-DD; negative years are BC)"
          aria-invalid={invalid}
          placeholder="YYYY-MM-DD"
          value={field ?? toDateField(sim)}
          onChange={(e) => {
            setField(e.target.value)
            setInvalid(false)
          }}
          onBlur={() => {
            setField(null)
            setInvalid(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitField()
          }}
        />
      </label>
    </div>
  )
}
