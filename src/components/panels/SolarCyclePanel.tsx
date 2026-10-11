import { useQueryClient } from '@tanstack/react-query'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { Sparkline } from '@/components/ui/Sparkline'
import { useSolarCycle } from '@/hooks/useSolarCycle'
import { kpStatus, statusVar } from '@/lib/severity'

import styles from './solar-cycle-panel.module.css'

const kpColor = (kp: number): string => statusVar(kpStatus(kp))

export function SolarCyclePanel() {
  const { data, isLoading, error } = useSolarCycle()
  const updatedAt = useQueryClient().getQueryState(['solar-cycle'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Solar Cycle 25">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Solar Cycle 25">
        <PanelState kind="unavailable" detail="The NOAA solar cycle feed did not answer" />
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
              <Readout
                value={data.latestSsn !== null ? String(Math.round(data.latestSsn)) : '—'}
                className={styles.bigNum ?? ''}
              />
              <Label>Sunspot №</Label>
            </div>
            <div className={styles.readout ?? ''}>
              <Readout
                value={data.latestF107 !== null ? String(Math.round(data.latestF107)) : '—'}
                className={styles.bigNum ?? ''}
              />
              <Label>F10.7 flux</Label>
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
            <PanelState kind="empty" detail="No Kp forecast yet" />
          )}
          <span className={styles.forecastNote ?? ''}>Amber line = G1 storm (Kp 5)</span>
        </div>
      </div>
    </GlassPanel>
  )
}
