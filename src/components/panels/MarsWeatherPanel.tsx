import { useQueryClient } from '@tanstack/react-query'
import { useMarsWeather } from '@/hooks/useMarsWeather'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import styles from './mars-weather-panel.module.css'

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className={styles.stat ?? ''}>
      <span className={styles.statLabel ?? ''}>{label}</span>
      <span className={styles.statValue ?? ''}>
        {value}
        {unit && <span className={styles.statUnit ?? ''}>{unit}</span>}
      </span>
    </div>
  )
}

export function MarsWeatherPanel() {
  const { data, isLoading, error } = useMarsWeather()
  const updatedAt = useQueryClient().getQueryState(['mars-weather'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Mars Weather">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Mars Weather">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label="Mars Weather">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.panel ?? ''}>
        <div className={styles.head ?? ''}>
          <div className={styles.sol ?? ''}>
            <span className={styles.solNum ?? ''}>SOL {data.sol.toLocaleString()}</span>
            <span className={styles.solDate ?? ''}>
              {data.terrestrialDate} · Curiosity · Gale Crater
            </span>
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
            unit=" Pa"
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
