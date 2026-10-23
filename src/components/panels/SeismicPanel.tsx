import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { Swatch } from '@/components/ui/Swatch'
import { useNow } from '@/hooks/useNow'
import { useQuakes } from '@/hooks/useQuakes'
import { LANES } from '@/lib/palette'
import { quakeStatus } from '@/lib/severity'
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
    </GlassPanel>
  )
}
