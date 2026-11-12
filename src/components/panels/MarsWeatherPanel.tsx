import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { useMarsWeather } from '@/hooks/useMarsWeather'
import { panelView } from '@/lib/panelView'

import styles from './mars-weather-panel.module.css'

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className={styles.stat ?? ''}>
      <Label>{label}</Label>
      <Readout value={value} unit={unit} className={styles.statValue ?? ''} />
    </div>
  )
}

export function MarsWeatherPanel() {
  const query = useMarsWeather()
  const view = panelView(query, 'mars-weather')

  if (view.kind === 'loading') {
    return (
      <GlassPanel variant="tile" label="Mars Weather">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (view.kind === 'unavailable') {
    return (
      <GlassPanel variant="tile" label="Mars Weather">
        <PanelState kind="unavailable" detail="The Curiosity REMS feed is not answering" />
      </GlassPanel>
    )
  }

  const { data, age } = view

  return (
    <GlassPanel variant="tile" label="Mars Weather">
      <DataAge {...age} />
      <div className={styles.panel ?? ''}>
        <div className={styles.head ?? ''}>
          <div className={styles.sol ?? ''}>
            <Readout value={`SOL ${data.sol.toLocaleString()}`} className={styles.solNum ?? ''} />
            <Label>{data.terrestrialDate} · Curiosity · Gale Crater</Label>
          </div>
        </div>

        <div className={styles.temps ?? ''}>
          <Stat
            label="High"
            value={data.maxTemp !== null ? String(Math.round(data.maxTemp)) : '—'}
            unit="°C"
          />
          <Stat
            label="Low"
            value={data.minTemp !== null ? String(Math.round(data.minTemp)) : '—'}
            unit="°C"
          />
          <Stat
            label="Pressure"
            value={data.pressure !== null ? String(Math.round(data.pressure)) : '—'}
            unit="Pa"
          />
        </div>

        <div className={styles.foot ?? ''}>
          {data.opacity && <span className={styles.chip ?? ''}>{data.opacity}</span>}
          {data.uv && <span className={styles.chip ?? ''}>UV {data.uv}</span>}
          {data.season && <span className={styles.chip ?? ''}>{data.season}</span>}
        </div>
      </div>
    </GlassPanel>
  )
}
