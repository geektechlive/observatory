import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { Swatch } from '@/components/ui/Swatch'
import { useAftershocks } from '@/hooks/useAftershocks'
import { useNow } from '@/hooks/useNow'
import { useQuakes } from '@/hooks/useQuakes'
import { LANES } from '@/lib/palette'
import { aftershockStatus, quakeStatus } from '@/lib/severity'
import type { Quake } from '@/schemas/quakes'

import styles from './seismic-panel.module.css'

const TITLE = 'Seismic, 24 h'
const WINDOW_MS = 24 * 3_600_000
const MAX_ROWS = 4
const CLOCK_TICK_MS = 60_000

type RatedQuake = Quake & { mag: number }

function strongestRecent(quakes: readonly Quake[], now: number): RatedQuake[] {
  return quakes
    .filter((q): q is RatedQuake => q.mag !== null && now - q.time <= WINDOW_MS)
    .sort((a, b) => b.mag - a.mag)
    .slice(0, MAX_ROWS)
}

const MAX_FORECASTS = 2

/** A probability as a whole percent; never "0%" for a chance that isn't zero. */
function percent(p: number): string {
  return p > 0 && p < 0.005 ? '<1%' : `${String(Math.round(p * 100))}%`
}

/**
 * USGS's own aftershock forecasts (#76): the chance of at least one M5+ / M6+ in the
 * next week, for the strongest recent quakes that have one. Hidden when none do.
 */
function AftershockOdds() {
  const { data } = useAftershocks()
  const forecasts = (data?.forecasts ?? []).slice(0, MAX_FORECASTS)
  if (forecasts.length === 0) return null
  return (
    <div className={styles.odds ?? ''}>
      <Label tone="dim">Aftershock odds · next 7 days · USGS</Label>
      <ul className={styles.oddsList ?? ''}>
        {forecasts.map((f) => {
          const tone = aftershockStatus(f.week)
          return (
            <li key={f.id} className={styles.oddsRow ?? ''}>
              <a href={f.url} target="_blank" rel="noreferrer" className={styles.place ?? ''}>
                M{f.mag.toFixed(1)} {f.place}
              </a>
              <span className={styles.oddsPair ?? ''}>
                <Label>M5+</Label>
                <Readout value={percent(f.week.m5)} tone={tone} className={styles.mag ?? ''} />
                <Label>M6+</Label>
                <Readout value={percent(f.week.m6)} tone={tone} className={styles.mag ?? ''} />
              </span>
            </li>
          )
        })}
      </ul>
      <Label>Only significant quakes get a forecast, sometimes hours after the event.</Label>
    </div>
  )
}

export function SeismicPanel() {
  const { data, isLoading, error } = useQuakes()
  const now = useNow(CLOCK_TICK_MS).getTime()

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label={TITLE}>
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label={TITLE}>
        <PanelState kind="unavailable" detail="The USGS earthquake feed did not answer" />
      </GlassPanel>
    )
  }

  const rows = strongestRecent(data.quakes, now)
  if (rows.length === 0) {
    return (
      <GlassPanel variant="tile" label={TITLE}>
        <PanelState kind="empty" detail="No quakes in the last 24 hours" />
        <AftershockOdds />
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label={TITLE}>
      <DataAge updatedAt={Date.parse(data.updatedAt)} />
      <ul className={styles.list ?? ''}>
        {rows.map((q) => (
          <li key={q.id} className={styles.row ?? ''}>
            <Swatch color={LANES.geo.emit} />
            <span className={styles.place ?? ''}>{q.place}</span>
            <Readout
              value={`M${q.mag.toFixed(1)}`}
              tone={quakeStatus(q.mag)}
              className={styles.mag ?? ''}
            />
          </li>
        ))}
      </ul>
      <AftershockOdds />
    </GlassPanel>
  )
}
