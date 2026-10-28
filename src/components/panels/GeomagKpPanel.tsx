import { KpSparkline } from '@/components/panels/KpSparkline'
import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { useAurora } from '@/hooks/useAurora'
import { useSolarWind } from '@/hooks/useSolarWind'
import { HORIZON_REACH_DEG, reachExtreme, type ReachPoint } from '@/lib/auroraReach'
import { kpStatus, type Status, statusVar } from '@/lib/severity'

import styles from './geomag-kp-panel.module.css'

const TITLE = 'Geomagnetic'
const MAX_G = 5

/** NOAA G-scale: G1 starts at Kp 5, so Kp 7 is G3. */
function statusLine(kp: number): string {
  const status: Status = kpStatus(kp)
  if (status === 'nominal') return 'Kp quiet'
  return `Kp ${status}, G${Math.min(MAX_G, Math.floor(kp) - 4)}`
}

/** "52°N", or "~43°N" for the horizon line; "quiet" when nothing reaches 10%. */
function latLabel(line: readonly ReachPoint[], horizon: boolean): string {
  const edge = reachExtreme(line)
  if (!edge) return 'quiet'
  const north = edge.lat > 0
  const lat = Math.abs(edge.lat) - (horizon ? HORIZON_REACH_DEG : 0)
  return `${horizon ? '~' : ''}${String(lat)}°${north ? 'N' : 'S'}`
}

/**
 * How far the aurora reaches (#77), from OVATION's likely (10%) edge: overhead, and on
 * the poleward horizon about 9° further toward the equator. Shares the globe's query.
 */
function AuroraReach() {
  const { data } = useAurora(true)
  const likely = data?.reach?.likely
  if (!likely) return null
  return (
    <div className={styles.reach ?? ''}>
      <Label tone="dim">Aurora reach · OVATION 10%</Label>
      <dl className={styles.reachList ?? ''}>
        <div className={styles.reachRow ?? ''}>
          <dt>
            <Label>Overhead</Label>
          </dt>
          <dd>
            <Readout value={latLabel(likely.n, false)} className={styles.reachValue ?? ''} />
            <Readout value={latLabel(likely.s, false)} className={styles.reachValue ?? ''} />
          </dd>
        </div>
        <div className={styles.reachRow ?? ''}>
          <dt>
            <Label>Horizon</Label>
          </dt>
          <dd>
            <Readout value={latLabel(likely.n, true)} className={styles.reachValue ?? ''} />
            <Readout value={latLabel(likely.s, true)} className={styles.reachValue ?? ''} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function GeomagKpPanel() {
  const { data, isLoading, error } = useSolarWind()

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
        <PanelState kind="unavailable" detail="The NOAA Kp feed did not answer" />
      </GlassPanel>
    )
  }

  const kp = data.currentKp
  const readings = data.kpReadings.map((r) => ({ observedTime: r.time, kpIndex: r.kp }))

  return (
    <GlassPanel variant="tile" label={TITLE}>
      <DataAge updatedAt={Date.parse(data.updatedAt)} />
      <div className={styles.panel ?? ''}>
        <div className={styles.head ?? ''}>
          <span data-testid="kp-now">
            <Readout
              value={kp !== null ? String(kp) : '—'}
              tone={kp !== null ? kpStatus(kp) : 'default'}
              className={styles.value ?? ''}
            />
          </span>
          {kp !== null && (
            <span className={styles.status ?? ''} style={{ color: statusVar(kpStatus(kp)) }}>
              {statusLine(kp)}
            </span>
          )}
        </div>
        <KpSparkline readings={readings} showHeader={false} />
        <AuroraReach />
      </div>
    </GlassPanel>
  )
}
