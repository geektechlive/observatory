import { useMemo } from 'react'

import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { useAurora } from '@/hooks/useAurora'
import { useClouds } from '@/hooks/useClouds'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useIssTle } from '@/hooks/useIssTle'
import { useNow } from '@/hooks/useNow'
import { useSolarCycle } from '@/hooks/useSolarCycle'
import { useSunMoon } from '@/hooks/useSunMoon'
import { auroraChanceAt, kpAt } from '@/lib/auroraChance'
import { type IssPass, tleEpoch, visiblePasses } from '@/lib/orbit/passes'
import {
  cloudCoverAt,
  type Darkness,
  darkWindow,
  STRIP_HOURS,
  type TonightSlot,
  tonightStrip,
} from '@/lib/tonight'

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

/** Aurora needs the Sun below -12°; brighter than that, no chance is shown. */
const DARK_ENOUGH: ReadonlySet<Darkness> = new Set(['astronomical', 'dark'])
/** OVATION forecasts 30–90 min ahead: shown for hours starting up to 1 h past its time. */
const OVATION_REACH_MS = 3_600_000

interface AuroraCell {
  text: string
  words: string
}

/**
 * One hour's aurora cell (#80): OVATION's chance times clear sky inside its forecast
 * window, the Kp forecast after it, and nothing while the sky is too bright.
 */
function auroraCell(
  slot: TonightSlot,
  chance: number | null,
  forecastMs: number,
  cloud: number | null,
  kp: number | null,
): AuroraCell {
  if (!DARK_ENOUGH.has(slot.darkness)) return { text: '—', words: '' }
  if (chance !== null && slot.time.getTime() <= forecastMs + OVATION_REACH_MS) {
    const pct = Math.round(chance * (1 - (cloud ?? 0) / 100))
    return { text: String(pct), words: `, aurora chance ${String(pct)}%` }
  }
  if (kp !== null)
    return { text: `Kp${String(Math.round(kp))}`, words: `, Kp forecast ${kp.toFixed(1)}` }
  return { text: '—', words: '' }
}

/**
 * "19:39–06:11" ahead of the dark period; "until 06:11" once it has begun, since its
 * computed start is only the top of the hour the strip begins at.
 */
function darkLabel(dark: { start: Date; end: Date } | null, now: Date): string {
  if (!dark) return 'not tonight'
  if (dark.start.getTime() <= now.getTime()) return `until ${clock(dark.end)}`
  return `${clock(dark.start)}–${clock(dark.end)}`
}

/**
 * Visible ISS passes (#81): sunlit station, dark sky, above 10°. Passes already over
 * are dropped; the orbit data's age is shown because a stale TLE drifts by minutes.
 */
function IssPasses({ passes, now, line1 }: { passes: IssPass[]; now: Date; line1: string }) {
  const ahead = passes.filter((p) => p.end.getTime() >= now.getTime())
  const ageHours = Math.max(0, Math.round((now.getTime() - tleEpoch(line1).getTime()) / 3_600_000))
  return (
    <div className={styles.passes ?? ''}>
      <Label tone="dim">Visible ISS passes</Label>
      {ahead.length === 0 ? (
        <Label>No visible ISS passes in the next 12 hours.</Label>
      ) : (
        <ul className={styles.passList ?? ''}>
          {ahead.map((p) => (
            <li key={p.start.getTime()} className={styles.pass ?? ''}>
              <Readout
                value={`${clock(p.start)}–${clock(p.end)}`}
                className={styles.passTime ?? ''}
              />
              <span className={styles.passWhere ?? ''}>
                up to {String(Math.round(p.maxElevation))}° · {p.from} → {p.to}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Label>Orbit data {String(ageHours)} h old</Label>
    </div>
  )
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
      <Label>
        Rounded to about 11 km and never saved. For cloud cover it is sent to Open-Meteo.
      </Label>
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
  const { data: clouds } = useClouds(coords)
  const { data: aurora } = useAurora(true)
  const { data: cycle } = useSolarCycle()
  const { data: tle } = useIssTle()
  const hour = Math.floor(now.getTime() / 3_600_000)

  const sky = useMemo(() => {
    if (!coords) return null
    const at = new Date(hour * 3_600_000)
    return {
      strip: tonightStrip(at, coords.lat, coords.lon),
      dark: darkWindow(at, coords.lat, coords.lon),
    }
  }, [coords, hour])

  const passes = useMemo(() => {
    if (!coords || !tle) return null
    return visiblePasses(tle, coords.lat, coords.lon, new Date(hour * 3_600_000), STRIP_HOURS)
  }, [coords, tle, hour])

  if (!coords || !sky) {
    return (
      <GlassPanel variant="tile" label={TITLE}>
        <Ask status={status} request={request} />
      </GlassPanel>
    )
  }

  const here = aurora?.grid ? auroraChanceAt(aurora.grid, coords.lat, coords.lon) : null
  const forecastMs = aurora ? Date.parse(aurora.forecastTime) || now.getTime() : now.getTime()
  const cells = sky.strip.map((slot) => {
    const cloud = clouds ? cloudCoverAt(clouds.hourly, slot.time) : null
    const kp = cycle ? (kpAt(cycle.kpForecast, slot.time)?.kp ?? null) : null
    return { slot, cloud, aurora: auroraCell(slot, here?.chance ?? null, forecastMs, cloud, kp) }
  })
  const nowCell = cells.find((c) => c.aurora.words.includes('chance'))

  return (
    <GlassPanel variant="tile" label={TITLE}>
      <div className={styles.body ?? ''}>
        <div className={styles.summary ?? ''}>
          <span className={styles.fact ?? ''}>
            <Label>Fully dark</Label>
            <Readout value={darkLabel(sky.dark, now)} className={styles.factValue ?? ''} />
          </span>
          {here && (
            <span className={styles.fact ?? ''}>
              <Label>Aurora chance</Label>
              <Readout
                value={nowCell ? `${nowCell.aurora.text}%` : '—'}
                className={styles.factValue ?? ''}
              />
            </span>
          )}
          <span className={styles.fact ?? ''}>
            <Label>Moon</Label>
            <Readout
              value={sunMoon ? `${String(sunMoon.fracIllum)}% lit` : '—'}
              className={styles.factValue ?? ''}
            />
          </span>
        </div>
        <ol className={styles.strip ?? ''}>
          {cells.map(({ slot, cloud, aurora: cell }) => {
            const moon = slot.moonUp ? ', moon up' : ''
            const cloudWords = cloud === null ? '' : `, ${String(cloud)}% cloud`
            return (
              <li
                key={slot.time.getTime()}
                className={styles.slot ?? ''}
                data-darkness={slot.darkness}
                aria-label={`${clock(slot.time)} ${DARKNESS_WORDS[slot.darkness]}${moon}${cloudWords}${cell.words}`}
              >
                <span className={styles.cell ?? ''} aria-hidden="true">
                  {slot.moonUp && <span className={styles.moon ?? ''} />}
                </span>
                <span className={styles.hour ?? ''} aria-hidden="true">
                  {clock(slot.time).slice(0, 2)}
                </span>
                {clouds && (
                  <span className={styles.cloud ?? ''} data-cloud aria-hidden="true">
                    {cloud === null ? '—' : String(cloud)}
                  </span>
                )}
                {here && (
                  <span className={styles.aurora ?? ''} data-aurora aria-hidden="true">
                    {cell.text}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
        <Label>
          {place(coords.lat, coords.lon)} · local times · darker cells are darker sky · dot: Moon up
          {clouds ? ' · then cloud %' : ''}
          {here ? ' · then aurora chance %, or the Kp forecast past OVATION’s range' : ''}
        </Label>
        {here && (
          <Label>
            Aurora: OVATION overhead {String(here.overhead)}% · on your poleward horizon{' '}
            {String(here.horizon)}%. Chance is the larger of overhead and half the horizon value,
            times clear sky: our estimate, not NOAA’s.
          </Label>
        )}
        {passes && tle && <IssPasses passes={passes} now={now} line1={tle.line1} />}
        <Label>
          Your approximate location is sent to{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>{' '}
          for cloud cover.
        </Label>
      </div>
    </GlassPanel>
  )
}
