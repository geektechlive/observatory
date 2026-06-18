import { useQueryClient } from '@tanstack/react-query'
import { useSolarCycle } from '@/hooks/useSolarCycle'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import { Sparkline } from '@/components/ui/Sparkline'
import styles from './solar-cycle-panel.module.css'

function kpColor(kp: number): string {
  if (kp >= 6) return 'var(--magenta)'
  if (kp >= 5) return 'var(--amber)'
  if (kp >= 4) return 'var(--copper-glow)'
  return 'var(--cyan)'
}

export function SolarCyclePanel() {
  const { data, isLoading, error } = useSolarCycle()
  const updatedAt = useQueryClient().getQueryState(['solar-cycle'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Solar Cycle 25">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Solar Cycle 25">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const ssn = data.cycle.map((c) => c.ssn)
  const kpValues = data.kpForecast.map((k) => k.kp)
  const peak = ssn.length > 0 ? Math.max(...ssn) : 0

  return (
    <GlassPanel variant="tile" label="Solar Cycle 25">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.panel ?? ''}>
        <div className={styles.cycle ?? ''}>
          <div className={styles.cycleHead ?? ''}>
            <div className={styles.readout ?? ''}>
              <span className={styles.bigNum ?? ''}>
                {data.latestSsn !== null ? Math.round(data.latestSsn) : '—'}
              </span>
              <span className={styles.bigLabel ?? ''}>Sunspot №</span>
            </div>
            <div className={styles.readout ?? ''}>
              <span className={styles.bigNum ?? ''}>
                {data.latestF107 !== null ? Math.round(data.latestF107) : '—'}
              </span>
              <span className={styles.bigLabel ?? ''}>F10.7 flux</span>
            </div>
          </div>
          {ssn.length > 1 && (
            <Sparkline
              values={ssn}
              mode="line"
              height={56}
              min={0}
              max={Math.ceil((peak + 20) / 10) * 10}
              color="var(--copper-glow)"
              fill
              ariaLabel="Monthly sunspot number since 2019"
            />
          )}
          <span className={styles.axis ?? ''} aria-hidden="true">
            <span>2019</span>
            <span>now</span>
          </span>
        </div>

        <div className={styles.forecast ?? ''}>
          <span className={styles.forecastLabel ?? ''}>Kp · 3-day forecast</span>
          {kpValues.length > 0 ? (
            <Sparkline
              values={kpValues}
              mode="bars"
              height={56}
              min={0}
              max={9}
              color={kpColor}
              thresholds={[{ value: 5, color: 'var(--amber)' }]}
              ariaLabel="Planetary Kp index 3-day forecast"
            />
          ) : (
            <div className={styles.noForecast ?? ''}>No forecast</div>
          )}
          <span className={styles.forecastNote ?? ''}>Amber line = G1 storm (Kp 5)</span>
        </div>
      </div>
    </GlassPanel>
  )
}
