import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { useCme } from '@/hooks/useCme'

import styles from './cme-panel.module.css'

function formatArrival(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return 'now'
  const h = Math.round(diff / 3_600_000)
  if (h < 48) return `~${h}h`
  return `~${Math.round(h / 24)}d`
}

export function CmePanel() {
  const { data, isLoading, error } = useCme()

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="CME Watch">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="CME Watch">
        <PanelState kind="unavailable" detail="The NOAA WSA-ENLIL model feed did not answer" />
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label="CME Watch">
      <div className={styles.panel ?? ''}>
        <div className={`${styles.status ?? ''} ${data.inbound ? (styles.alert ?? '') : ''}`}>
          <span className={styles.statusDot ?? ''} aria-hidden="true" />
          <span className={styles.statusText ?? ''}>
            {data.inbound ? 'EARTH-DIRECTED CME' : 'NO CME INBOUND'}
          </span>
        </div>

        {data.inbound && (
          <div className={styles.arrival ?? ''}>
            <Label>Modeled arrival</Label>
            <Readout
              value={formatArrival(data.arrival)}
              tone="watch"
              className={styles.arrivalValue ?? ''}
            />
          </div>
        )}

        <div className={styles.model ?? ''}>
          <div className={styles.modelStat ?? ''}>
            <Readout
              value={data.earthSpeed !== null ? String(Math.round(data.earthSpeed)) : '—'}
              className={styles.modelValue ?? ''}
            />
            <Label>km/s at Earth</Label>
          </div>
          <div className={styles.modelStat ?? ''}>
            <Readout
              value={data.earthDensity !== null ? data.earthDensity.toFixed(1) : '—'}
              className={styles.modelValue ?? ''}
            />
            <Label>p/cm³</Label>
          </div>
        </div>
        <Label>NOAA WSA-ENLIL model</Label>
      </div>
    </GlassPanel>
  )
}
