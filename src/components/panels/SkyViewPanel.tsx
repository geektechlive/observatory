import { useEffect, useMemo, useRef } from 'react'

import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { useCometsTonight } from '@/hooks/useCometsTonight'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useNow } from '@/hooks/useNow'
import { MIN_ALTITUDE } from '@/lib/sky/cometsTonight'
import { serialiseSkyLink } from '@/lib/sky/skyLink'
import { findSkyTarget, type SkyTarget } from '@/lib/sky/tonightTarget'
import {
  bodyRange,
  hourlyRows,
  nightAround,
  skyAt,
  skyRun,
  skyTrack,
  twilightBand,
} from '@/lib/sky/track'

import styles from './sky-view-panel.module.css'
import { SkyDome } from './SkyDome'
import { useSkyLink } from './useSkyLink'

const NOW_TICK_MS = 60_000

const clock = (d: Date) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
const day = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short' })

const DARKNESS_WORDS = {
  day: 'day',
  civil: 'civil twilight',
  nautical: 'nautical twilight',
  astronomical: 'astronomical twilight',
  dark: 'fully dark',
} as const

/** UTC, because the orrery shows UTC and the two clocks should be easy to compare. */
const utcClock = (d: Date) => d.toISOString().slice(11, 16)

/** Which clock the moment came from. */
type Source = 'live' | 'orrery' | 'link'

/**
 * The sky view for one object (#99 item 5), opened by `#sky?target=sbc:<SPK-ID>[&t=…]`
 * from a Tonight row or the orrery's inspector. Nothing shows without a target. It uses
 * the visitor's shared location (never the Greenwich stand-in) and sends it nowhere itself;
 * the Tonight panel beside it sends it to Open-Meteo for cloud cover. Its positions come
 * from the Tonight slice's Horizons samples and are never extrapolated.
 */
export function SkyViewPanel({ className }: { className?: string }) {
  const link = useSkyLink()
  if (link.target === null) return null
  return (
    <SkyView target={link.target} t={link.t} fromOrrery={link.fromOrrery} className={className} />
  )
}

function SkyView({
  target,
  t,
  fromOrrery,
  className,
}: {
  target: string
  t: number | null
  fromOrrery: boolean
  className: string | undefined
}) {
  const { coords, status, request } = useGeolocation()
  const { data, error } = useCometsTonight({ enabled: true })
  const now = useNow(NOW_TICK_MS)
  const ref = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Whatever had focus when the view opened (a Tonight link), to give it back on Close.
  const openerRef = useRef<Element | null>(null)
  const real = coords && !coords.isFallback ? coords : null
  const lat = real?.lat
  const lon = real?.lon

  // A new target brings the view into sight and puts focus on its heading: it sits below
  // the fold, away from the row that opened it.
  useEffect(() => {
    const active = document.activeElement
    openerRef.current =
      active && active !== document.body && !ref.current?.contains(active) ? active : null
    headingRef.current?.focus({ preventScroll: true })
    ref.current?.scrollIntoView({ block: 'center' })
  }, [target])

  const close = () => {
    const opener = openerRef.current
    // The link that opened it, if it is still there; else the selected console tab.
    const back =
      opener instanceof HTMLElement && opener.isConnected
        ? opener
        : document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    window.location.hash = serialiseSkyLink({ target: null, t: null })
    back?.focus()
  }
  const live = () => {
    window.location.hash = serialiseSkyLink({ target, t: null })
  }

  const found = useMemo(
    () => (data && !error ? findSkyTarget(data, target) : null),
    [data, error, target],
  )
  const source: Source = t === null ? 'live' : fromOrrery ? 'orrery' : 'link'
  const shownAt = t === null ? now : new Date(t)

  return (
    <div ref={ref} id="sky-view" className={className}>
      <GlassPanel variant="tile" label="Sky view">
        <div className={styles.body ?? ''}>
          <h3 ref={headingRef} tabIndex={-1} className={styles.name ?? ''}>
            {found?.name ?? 'Sky view'}
          </h3>
          {lat === undefined || lon === undefined ? (
            <Ask status={status} request={request} />
          ) : !data ? (
            <p className={styles.text ?? ''}>
              {error ? 'The sky view data is unavailable.' : 'Loading from the Tonight data…'}
            </p>
          ) : !found ? (
            <p className={styles.text ?? ''}>
              This object isn’t in this week’s Tonight data (bright comets and asteroids only).
            </p>
          ) : (
            <Shown target={found} lat={lat} lon={lon} at={shownAt} source={source} onNow={live} />
          )}
          <button type="button" className={styles.btn ?? ''} onClick={close}>
            Close
          </button>
        </div>
      </GlassPanel>
    </div>
  )
}

function Ask({ status, request }: { status: string; request: () => void }) {
  return (
    <div className={styles.ask ?? ''}>
      <p className={styles.text ?? ''}>
        The sky view needs your location, to know which part of the sky is above your horizon.
      </p>
      {status === 'unsupported' ? (
        <p className={styles.text ?? ''}>This browser can’t share a location.</p>
      ) : (
        <button
          type="button"
          className={styles.btn ?? ''}
          onClick={request}
          disabled={status === 'requesting'}
        >
          {status === 'requesting' ? 'Locating…' : 'Use my location'}
        </button>
      )}
      {status === 'denied' && <p className={styles.text ?? ''}>Location denied.</p>}
      <p className={styles.text ?? ''}>
        Rounded to about 11 km and never saved. The Tonight panel sends it to Open-Meteo for cloud
        cover.
      </p>
    </div>
  )
}

interface ShownProps {
  target: SkyTarget
  lat: number
  lon: number
  at: Date
  source: Source
  onNow: () => void
}

function Shown({ target, lat, lon, at, source, onNow }: ShownProps) {
  const minute = Math.floor(at.getTime() / 60_000)
  // Primitives and the memoised target only, so this recomputes when the minute changes.
  const sky = useMemo(() => {
    const observer = { lat, lon }
    const when = new Date(minute * 60_000)
    const night = nightAround(when, lat, lon)
    if (!night) return null
    const track = skyTrack(target.body, observer, night)
    return {
      night,
      track,
      band: twilightBand(night, observer.lat, observer.lon),
      hours: hourlyRows(target.body, observer, night),
      run: track.covered ? skyRun(target.body, observer, track.covered.window) : null,
      here: skyAt(target.body, observer, when),
      when,
    }
  }, [target, lat, lon, minute])

  if (!sky) {
    return (
      <p className={styles.text ?? ''}>
        The Sun doesn’t set here within a day of this moment, so there is no night to draw.
      </p>
    )
  }
  const { night, track, band, hours, run, here, when } = sky
  const inNight = when >= night.start && when <= night.end
  const marker = inNight && here && here.altitude >= 0 ? here : null
  const range = bodyRange(target.body)

  const summary = run
    ? `Between sunset and sunrise it is above ${String(MIN_ALTITUDE)}° ${clock(run.from)}–${clock(run.to)}, highest ${String(Math.round(run.altitude))}° ${run.direction} at ${clock(run.best)}.`
    : track.covered
      ? `Never above ${String(MIN_ALTITUDE)}° in this night’s samples.`
      : ''
  const label = `Sky dome for ${target.name}, east on the left. ${summary}`.trim()
  const nowText = describeNow(when, night, here)

  return (
    <>
      <div className={styles.head ?? ''}>
        <p className={styles.text ?? ''} data-testid="sky-when">
          {whenText(source, when)}
        </p>
        {source !== 'live' && (
          <button type="button" className={styles.btn ?? ''} onClick={onNow}>
            Now
          </button>
        )}
      </div>
      <SkyDome
        name={target.name}
        kind={target.kind}
        label={label}
        segments={track.segments}
        hours={hours}
        marker={marker}
      />
      <TwilightBand band={band} night={night} when={inNight ? when : null} />
      {!track.covered && range && (
        <p className={styles.note ?? ''} role="status">
          JPL’s samples for {target.name} run {day(range.start)} to {day(range.end)} and don’t cover
          this night. Positions are never extrapolated, so nothing is drawn.
        </p>
      )}
      {track.covered?.partial && (
        <p className={styles.note ?? ''} role="status">
          The samples cover only part of this night ({clock(track.covered.window.start)}–
          {clock(track.covered.window.end)}); the rest is not drawn.
        </p>
      )}
      <p className={styles.text ?? ''}>{summary}</p>
      <p className={styles.text ?? ''}>{nowText}</p>
      <Hours hours={hours} />
      <p className={styles.text ?? ''}>
        Local times · refraction ignored, so times are 10-minute samples, not rise and set ·
        positions from JPL Horizons samples · tick ring: compass, 5° apart
      </p>
    </>
  )
}

/** The moment shown, in local time and UTC, and whose clock it is. */
function whenText(source: Source, when: Date): string {
  const stamp = `${day(when)} ${clock(when)} local (${utcClock(when)} UTC)`
  if (source === 'orrery') return `the sky at the orrery’s time when you opened this: ${stamp}`
  if (source === 'link') return `the sky at ${stamp}`
  return `the sky now: ${stamp}`
}

function describeNow(
  when: Date,
  night: { start: Date; end: Date },
  here: { altitude: number; azimuth: number } | null,
): string {
  if (!here) return 'No JPL sample for the moment shown.'
  const dir = `${String(Math.round(here.azimuth))}°`
  if (when < night.start || when > night.end) {
    const phase = when < night.start ? 'before sunset' : 'after sunrise'
    return `At ${clock(when)} it is ${phase} here (${String(Math.round(here.altitude))}°, azimuth ${dir}).`
  }
  return here.altitude >= 0
    ? `At ${clock(when)}: ${String(Math.round(here.altitude))}° up, azimuth ${dir}.`
    : `At ${clock(when)}: below the horizon (${String(Math.round(here.altitude))}°).`
}

function TwilightBand({
  band,
  night,
  when,
}: {
  band: ReturnType<typeof twilightBand>
  night: { start: Date; end: Date }
  when: Date | null
}) {
  const span = night.end.getTime() - night.start.getTime()
  const pct = (d: Date) => `${String(((d.getTime() - night.start.getTime()) / span) * 100)}%`
  return (
    <div className={styles.bandWrap ?? ''}>
      <ol className={styles.band ?? ''} data-testid="sky-twilight" aria-hidden="true">
        {band.map((c) => (
          <li
            key={c.from.getTime()}
            data-darkness={c.darkness}
            style={{ flexGrow: c.to.getTime() - c.from.getTime() }}
          />
        ))}
      </ol>
      {when && (
        <span className={styles.bandNow ?? ''} style={{ left: pct(when) }} aria-hidden="true" />
      )}
      <div className={styles.bandEnds ?? ''}>
        <Label>{`Sunset ${clock(night.start)}`}</Label>
        <Label>{`Sunrise ${clock(night.end)}`}</Label>
      </div>
    </div>
  )
}

function Hours({ hours }: { hours: ReturnType<typeof hourlyRows> }) {
  return (
    <details className={styles.hours ?? ''}>
      <summary>Hour by hour</summary>
      <ul>
        {hours.map((h) => (
          <li key={h.time.getTime()} data-testid="sky-hour">
            {clock(h.time)} ·{' '}
            {h.altitude === null || h.direction === null
              ? 'no JPL sample'
              : h.altitude >= 0
                ? `${String(Math.round(h.altitude))}° up, ${h.direction}`
                : `below the horizon (${String(Math.round(h.altitude))}°)`}{' '}
            · {DARKNESS_WORDS[h.darkness]}
          </li>
        ))}
      </ul>
    </details>
  )
}
