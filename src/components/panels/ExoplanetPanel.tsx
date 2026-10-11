import { GlassPanel } from '@/components/ui/GlassPanel'
import { PanelState } from '@/components/ui/PanelState'
import { useCountUp } from '@/hooks/useCountUp'
import { useExoplanets } from '@/hooks/useExoplanets'

import styles from './counter-panel.module.css'

export function ExoplanetPanel() {
  const { data, isLoading, error } = useExoplanets()
  const animated = useCountUp(data?.count ?? 0)

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Exoplanets">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Exoplanets">
        <PanelState kind="unavailable" detail="The NASA Exoplanet Archive is not answering" />
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label="Exoplanets">
      <div className={styles.panel ?? ''}>
        <span className={styles.value ?? ''} style={{ color: 'var(--signal)' }}>
          {animated.toLocaleString()}
        </span>
        <span className={styles.label ?? ''}>Confirmed exoplanets</span>
        <span className={styles.sub ?? ''}>NASA Exoplanet Archive</span>
      </div>
    </GlassPanel>
  )
}
