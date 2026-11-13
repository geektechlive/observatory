import { useMemo } from 'react'

import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { useCometsTonight } from '@/hooks/useCometsTonight'
import { jdFromDate } from '@/lib/orrery/kepler'
import {
  type AsteroidReach,
  asteroidsTonight,
  FAINTEST_ASTEROID_LISTED,
  type TonightAsteroid,
} from '@/lib/sky/asteroidsTonight'
import {
  cometsTonight,
  FAINTEST_LISTED,
  MIN_ALTITUDE,
  type Reach,
  type TonightComet,
} from '@/lib/sky/cometsTonight'

import styles from './tonight-panel.module.css'

const REACH_WORDS: Record<Reach, string> = {
  'naked-eye': 'naked eye, dark sky',
  binoculars: 'binoculars',
  'small-telescope': 'small telescope',
  'large-telescope': '8-inch telescope or larger',
}

const ASTEROID_REACH_WORDS: Record<AsteroidReach, string> = {
  'naked-eye': 'naked eye, dark sky',
  binoculars: 'binoculars',
  'small-telescope': 'small telescope',
}

const clock = (d: Date) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

const where = (c: { direction: string; azimuth: number; altitude: number }) =>
  `${c.direction} ${String(Math.round(c.azimuth))}° · ${String(Math.round(c.altitude))}° up`

type Window = { start: Date; end: Date }

interface Props {
  coords: { lat: number; lon: number }
  /** The current or next fully dark period (Sun below -18°), from `darkWindow`; null if none. */
  dark: Window | null
  /** The same for nautical dark (Sun below -12°), which is what the asteroids use. */
  nautical: Window | null
  now: Date
}

/** One row: a comet or an asteroid, with the numbers the list is sorted by. */
type Row =
  | { kind: 'comet'; magnitude: number; comet: TonightComet }
  | { kind: 'asteroid'; magnitude: number; asteroid: TonightAsteroid }

/** The part of a dark window still ahead, or null once it is over. */
function remaining(window: Window | null, minute: number): Window | null {
  if (!window) return null
  const start = new Date(Math.max(window.start.getTime(), minute * 60_000))
  return start < window.end ? { start, end: window.end } : null
}

/**
 * Comets and bright asteroids up in the dark tonight (#99), our stand-in for JPL's missing
 * sb_obs: the refresh job's objects placed from the user's location, computed in the
 * browser. Its data comes from our own API (a week of each object's spans, #135), so the
 * location goes nowhere new. Comets need astronomical dark (their light is faint and
 * spread out); an asteroid is a point of light and needs only nautical dark.
 */
export function CometsTonight({ coords, dark, nautical, now }: Props) {
  const { data, error } = useCometsTonight({ enabled: true })
  const minute = Math.floor(now.getTime() / 60_000)

  // A copy left stale by a long refresh outage ends before tonight does: say so, rather
  // than "nothing is up", since nothing is extrapolated past the slice's spans (#135).
  const outdated =
    data !== undefined &&
    [dark, nautical].some((w) => w !== null && jdFromDate(w.end) > data.window.toJd)

  const result = useMemo(() => {
    if (!data || outdated) return null
    const cometWindow = remaining(dark, minute)
    const rockWindow = remaining(nautical, minute)
    const comets = cometWindow ? cometsTonight(data.comets, coords, cometWindow) : null
    const asteroids = rockWindow
      ? asteroidsTonight(
          data.asteroids.map((a) => ({ ...a, coarse: null })),
          coords,
          rockWindow,
        )
      : []
    const rows: Row[] = [
      ...(comets?.visible ?? []).map((comet): Row => ({
        kind: 'comet',
        magnitude: comet.magnitude,
        comet,
      })),
      ...asteroids.map((asteroid): Row => ({
        kind: 'asteroid',
        magnitude: asteroid.magnitude,
        asteroid,
      })),
    ].sort((a, b) => a.magnitude - b.magnitude)
    return { rows, brightestFaint: comets?.brightestFaint ?? null }
  }, [data, dark, nautical, coords, minute, outdated])

  const hasAsteroids = result?.rows.some((r) => r.kind === 'asteroid') ?? false

  return (
    <div className={styles.passes ?? ''}>
      <Label tone="dim">Comets and asteroids tonight</Label>
      <TonightBody
        data={data !== undefined}
        error={error}
        dark={dark}
        nautical={nautical}
        outdated={outdated}
        result={result}
      />
      {dark && (
        <Label>
          Comet brightness is JPL’s forecast, and comets often miss it by a magnitude or two.
        </Label>
      )}
      {hasAsteroids && (
        <Label>
          Asteroid brightness is an estimate from JPL’s H and G (G = 0.15 where JPL has none).
        </Label>
      )}
    </div>
  )
}

function TonightBody({
  data,
  error,
  dark,
  nautical,
  outdated,
  result,
}: {
  data: boolean
  error: Error | null
  dark: Window | null
  nautical: Window | null
  outdated: boolean
  result: { rows: Row[]; brightestFaint: TonightComet | null } | null
}) {
  if (!nautical && !dark) {
    return (
      <Label>It doesn’t get dark enough here tonight, so no comets or asteroids are listed.</Label>
    )
  }
  if (!data)
    return (
      <Label>{error ? 'The comet data is unavailable.' : 'Loading comets and asteroids…'}</Label>
    )
  if (outdated) return <Label>The comet data is out of date, so nothing is listed.</Label>
  const noComets = !dark && (
    <Label>It doesn’t get fully dark here tonight, so no comets are listed.</Label>
  )
  const rows = result?.rows ?? []
  const faint = result?.brightestFaint
  return (
    <>
      {noComets}
      {rows.length > 0 && (
        <ul className={styles.passList ?? ''}>
          {rows.map((row) =>
            row.kind === 'comet' ? (
              <CometItem key={row.comet.id} c={row.comet} />
            ) : (
              <AsteroidItem key={row.asteroid.id} a={row.asteroid} />
            ),
          )}
        </ul>
      )}
      {dark && !rows.some((r) => r.kind === 'comet') && (
        <Label>
          No comet bright enough for a backyard telescope (magnitude {String(FAINTEST_LISTED)}) is
          up in the dark tonight.
          {faint &&
            ` The brightest one up, ${faint.name}, should be about magnitude ${faint.magnitude.toFixed(1)}, ${String(Math.round(faint.altitude))}° up at ${clock(faint.best)}.`}
        </Label>
      )}
      {nautical && !rows.some((r) => r.kind === 'asteroid') && (
        <Label>
          No asteroid brighter than magnitude {String(FAINTEST_ASTEROID_LISTED)} is up in the dark
          tonight.
        </Label>
      )}
    </>
  )
}

function CometItem({ c }: { c: TonightComet }) {
  return (
    <li className={styles.comet ?? ''}>
      <span className={styles.cometName ?? ''}>
        {c.name}
        {c.interstellar && <span className={styles.cometTag ?? ''}> · interstellar</span>}
      </span>
      <Readout value={`best ${clock(c.best)}`} className={styles.cometTime ?? ''} />
      <span className={styles.passWhere ?? ''}>
        {where(c)} · mag {c.magnitude.toFixed(1)} · {c.reach ? REACH_WORDS[c.reach] : ''}
      </span>
    </li>
  )
}

function AsteroidItem({ a }: { a: TonightAsteroid }) {
  return (
    <li className={styles.comet ?? ''}>
      <span className={styles.cometName ?? ''}>
        {a.name}
        <span className={styles.cometTag ?? ''}> · asteroid</span>
      </span>
      <Readout value={`best ${clock(a.best)}`} className={styles.cometTime ?? ''} />
      <span className={styles.passWhere ?? ''}>
        above {String(MIN_ALTITUDE)}° {clock(a.from)}–{clock(a.to)} · {where(a)} · mag{' '}
        {a.magnitude.toFixed(1)} · {a.reach ? ASTEROID_REACH_WORDS[a.reach] : ''}
      </span>
    </li>
  )
}
