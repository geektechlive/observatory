import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { useCo2 } from '@/hooks/useCo2'

import styles from './counter-panel.module.css'

export function Co2Panel() {
  const { data, isLoading, error } = useCo2()

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Atmospheric CO₂">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Atmospheric CO₂">
        <PanelState kind="unavailable" detail="The Mauna Loa CO₂ feed did not answer" />
      </GlassPanel>
    )
  }

  const yoy = data.yearAgo !== null ? data.ppm - data.yearAgo : null

  return (
    <GlassPanel variant="tile" label="Atmospheric CO₂">
      <div className={styles.panel ?? ''}>
        <Readout value={data.ppm.toFixed(1)} unit="ppm" className={styles.value ?? ''} />
        <Label tone="dim">Global trend · Mauna Loa</Label>
        <span className={styles.sub ?? ''}>
          {yoy !== null && <span className={styles.delta ?? ''}>+{yoy.toFixed(1)} ppm/yr · </span>}
          {data.date}
        </span>
      </div>
    </GlassPanel>
  )
}
