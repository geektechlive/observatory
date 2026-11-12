import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { PanelState } from '@/components/ui/PanelState'
import { useCountUp } from '@/hooks/useCountUp'
import { useExoplanets } from '@/hooks/useExoplanets'
import { panelView } from '@/lib/panelView'

import styles from './counter-panel.module.css'

export function ExoplanetPanel() {
  const query = useExoplanets()
  const animated = useCountUp(query.data?.count ?? 0)
  const view = panelView(query, 'exoplanets')

  if (view.kind === 'loading') {
    return (
      <GlassPanel variant="tile" label="Exoplanets">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (view.kind === 'unavailable') {
    return (
      <GlassPanel variant="tile" label="Exoplanets">
        <PanelState kind="unavailable" detail="The NASA Exoplanet Archive is not answering" />
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label="Exoplanets">
      {view.refreshFailed && <DataAge {...view.age} />}
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
