import { useCme } from '@/hooks/useCme'
import { GlassPanel } from '@/components/ui/GlassPanel'
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
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="CME Watch">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
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
            <span className={styles.arrivalLabel ?? ''}>Modeled arrival</span>
            <span className={styles.arrivalValue ?? ''}>{formatArrival(data.arrival)}</span>
          </div>
        )}

        <div className={styles.model ?? ''}>
          <div className={styles.modelStat ?? ''}>
            <span className={styles.modelValue ?? ''}>
              {data.earthSpeed !== null ? Math.round(data.earthSpeed) : '—'}
            </span>
            <span className={styles.modelLabel ?? ''}>km/s at Earth</span>
          </div>
          <div className={styles.modelStat ?? ''}>
            <span className={styles.modelValue ?? ''}>
              {data.earthDensity !== null ? data.earthDensity.toFixed(1) : '—'}
            </span>
            <span className={styles.modelLabel ?? ''}>p/cm³</span>
          </div>
        </div>
        <span className={styles.source ?? ''}>NOAA WSA-ENLIL model</span>
      </div>
    </GlassPanel>
  )
}
