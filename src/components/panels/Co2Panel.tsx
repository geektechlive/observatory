import { useCo2 } from '@/hooks/useCo2'
import { GlassPanel } from '@/components/ui/GlassPanel'
import styles from './counter-panel.module.css'

export function Co2Panel() {
  const { data, isLoading, error } = useCo2()

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Atmospheric CO₂">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Atmospheric CO₂">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const yoy = data.yearAgo !== null ? data.ppm - data.yearAgo : null

  return (
    <GlassPanel variant="tile" label="Atmospheric CO₂">
      <div className={styles.panel ?? ''}>
        <span className={styles.value ?? ''} style={{ color: 'var(--amber)' }}>
          {data.ppm.toFixed(1)}
          <span className={styles.unit ?? ''}>ppm</span>
        </span>
        <span className={styles.label ?? ''}>Global trend · Mauna Loa</span>
        <span className={styles.sub ?? ''}>
          {yoy !== null && <span className={styles.delta ?? ''}>+{yoy.toFixed(1)} ppm/yr · </span>}
          {data.date}
        </span>
      </div>
    </GlassPanel>
  )
}
