import { useMemo } from 'react'

import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useNow } from '@/hooks/useNow'
import { useSunMoon } from '@/hooks/useSunMoon'
import { type Darkness, darkWindow, tonightStrip } from '@/lib/tonight'

import styles from './tonight-panel.module.css'

const TITLE = 'Tonight from here'
const CLOCK_TICK_MS = 60_000

const DARKNESS_WORDS: Record<Darkness, string> = {
  day: 'day',
  civil: 'civil twilight',
  nautical: 'nautical twilight',
  astronomical: 'astronomical twilight',
  dark: 'fully dark',
}

const clock = (d: Date) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

const place = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`

/**
 * "19:39–06:11" ahead of the dark period; "until 06:11" once it has begun, since its
 * computed start is only the top of the hour the strip begins at.
 */
function darkLabel(dark: { start: Date; end: Date } | null, now: Date): string {
  if (!dark) return 'not tonight'
  if (dark.start.getTime() <= now.getTime()) return `until ${clock(dark.end)}`
  return `${clock(dark.start)}–${clock(dark.end)}`
}

/** Before the user shares a location: say what the panel does, and ask. */
function Ask({ status, request }: { status: string; request: () => void }) {
  return (
    <div className={styles.ask ?? ''}>
      <Label tone="dim">Darkness and the Moon, hour by hour, for where you are.</Label>
      {status === 'unsupported' ? (
        <Label>This browser can't share a location.</Label>
      ) : (
        <button
          type="button"
          className={styles.locateBtn ?? ''}
          onClick={request}
          disabled={status === 'requesting'}
        >
          {status === 'requesting' ? 'Locating…' : 'Use my location'}
        </button>
      )}
      {status === 'denied' && <Label>Location denied.</Label>}
      <Label>Rounded to about 11 km and never saved.</Label>
    </div>
  )
}

/**
 * "Tonight, from here" (#78): how dark the next twelve hours get and when the Moon is
 * up, at the user's location. Computed in the browser; nothing about the location
 * leaves it here. Shares the location with Sun & Moon through the ui store.
 */
export function TonightPanel() {
  const { coords, status, request } = useGeolocation()
  const now = useNow(CLOCK_TICK_MS)
  const { data: sunMoon } = useSunMoon()
  const hour = Math.floor(now.getTime() / 3_600_000)

  const sky = useMemo(() => {
    if (!coords) return null
    const at = new Date(hour * 3_600_000)
    return {
      strip: tonightStrip(at, coords.lat, coords.lon),
      dark: darkWindow(at, coords.lat, coords.lon),
    }
  }, [coords, hour])

  if (!coords || !sky) {
    return (
      <GlassPanel variant="tile" label={TITLE}>
        <Ask status={status} request={request} />
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label={TITLE}>
      <div className={styles.body ?? ''}>
        <div className={styles.summary ?? ''}>
          <span className={styles.fact ?? ''}>
            <Label>Fully dark</Label>
            <Readout value={darkLabel(sky.dark, now)} className={styles.factValue ?? ''} />
          </span>
          <span className={styles.fact ?? ''}>
            <Label>Moon</Label>
            <Readout
              value={sunMoon ? `${String(sunMoon.fracIllum)}% lit` : '—'}
              className={styles.factValue ?? ''}
            />
          </span>
        </div>
        <ol className={styles.strip ?? ''}>
          {sky.strip.map((slot) => (
            <li
              key={slot.time.getTime()}
              className={styles.slot ?? ''}
              data-darkness={slot.darkness}
              aria-label={`${clock(slot.time)} ${DARKNESS_WORDS[slot.darkness]}${slot.moonUp ? ', moon up' : ''}`}
            >
              <span className={styles.cell ?? ''} aria-hidden="true">
                {slot.moonUp && <span className={styles.moon ?? ''} />}
              </span>
              <span className={styles.hour ?? ''} aria-hidden="true">
                {clock(slot.time).slice(0, 2)}
              </span>
            </li>
          ))}
        </ol>
        <Label>
          {place(coords.lat, coords.lon)} · local times · darker cells are darker sky · dot: Moon up
        </Label>
      </div>
    </GlassPanel>
  )
}
