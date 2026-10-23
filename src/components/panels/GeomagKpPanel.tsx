import { KpSparkline } from '@/components/panels/KpSparkline'
import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { useSolarWind } from '@/hooks/useSolarWind'
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
      </div>
    </GlassPanel>
  )
}
