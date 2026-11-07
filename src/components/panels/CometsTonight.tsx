import { useMemo } from 'react'

import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { useOrrerySmallBodies } from '@/hooks/useOrrerySmallBodies'
import {
  cometsTonight,
  FAINTEST_LISTED,
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

const clock = (d: Date) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

const where = (c: TonightComet) =>
  `${c.direction} ${String(Math.round(c.azimuth))}° · ${String(Math.round(c.altitude))}° up`

interface Props {
  coords: { lat: number; lon: number }
  /** The current or next fully dark period, from `darkWindow`; null if there is none. */
  dark: { start: Date; end: Date } | null
  now: Date
}

/**
 * Comets up in the dark tonight (#99), our stand-in for JPL's missing sb_obs: the
 * refresh job's comets (and interstellar objects) placed from the user's location,
 * computed in the browser. Its data comes from our own API, so the location goes
 * nowhere new.
 */
export function CometsTonight({ coords, dark, now }: Props) {
  const { data, error } = useOrrerySmallBodies()
  const minute = Math.floor(now.getTime() / 60_000)

  const result = useMemo(() => {
    if (!data || !dark) return null
    const start = new Date(Math.max(dark.start.getTime(), minute * 60_000))
    if (start >= dark.end) return null
    return cometsTonight([...data.comets, ...data.interstellar], coords, { start, end: dark.end })
  }, [data, dark, coords, minute])

  return (
    <div className={styles.passes ?? ''}>
      <Label tone="dim">Comets tonight</Label>
      <CometsBody data={data !== undefined} error={error} dark={dark} result={result} />
      <Label>
        Brightness is JPL’s forecast. Comets often come in a magnitude or two off, and look fainter
        than a star of the same magnitude because their light is spread out.
      </Label>
    </div>
  )
}

function CometsBody({
  data,
  error,
  dark,
  result,
}: {
  data: boolean
  error: Error | null
  dark: Props['dark']
  result: ReturnType<typeof cometsTonight> | null
}) {
  if (!dark) return <Label>It doesn’t get fully dark here tonight, so no comets are listed.</Label>
  if (!data) return <Label>{error ? 'The comet data is unavailable.' : 'Loading comets…'}</Label>
  if (!result || result.visible.length === 0) {
    const faint = result?.brightestFaint
    return (
      <Label>
        No comet bright enough for a backyard telescope (magnitude {String(FAINTEST_LISTED)}) is up
        in the dark tonight.
        {faint &&
          ` The brightest one up, ${faint.name}, should be about magnitude ${faint.magnitude.toFixed(1)}, ${String(Math.round(faint.altitude))}° up at ${clock(faint.best)}.`}
      </Label>
    )
  }
  return (
    <ul className={styles.passList ?? ''}>
      {result.visible.map((c) => (
        <li key={c.id} className={styles.comet ?? ''}>
          <span className={styles.cometName ?? ''}>
            {c.name}
            {c.interstellar && <span className={styles.cometTag ?? ''}> · interstellar</span>}
          </span>
          <Readout value={`best ${clock(c.best)}`} className={styles.cometTime ?? ''} />
          <span className={styles.passWhere ?? ''}>
            {where(c)} · mag {c.magnitude.toFixed(1)} · {c.reach ? REACH_WORDS[c.reach] : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
