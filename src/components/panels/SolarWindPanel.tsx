import { useQueryClient } from '@tanstack/react-query'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { Sparkline } from '@/components/ui/Sparkline'
import { useSolarWind } from '@/hooks/useSolarWind'
import { bzStatus, kpStatus, statusVar } from '@/lib/severity'

import { KpSparkline } from './KpSparkline'
import styles from './solar-wind-panel.module.css'

const SPARK_H = 22

const kpColor = (kp: number): string => statusVar(kpStatus(kp))

function auroraLabel(kp: number): string {
  if (kp <= 1) return 'QUIET'
  if (kp <= 2) return 'UNSETTLED'
  if (kp <= 3) return 'ACTIVE'
  if (kp <= 5) return 'MINOR STORM'
  if (kp <= 7) return 'MODERATE STORM'
  if (kp <= 8) return 'STRONG STORM'
  return 'EXTREME STORM'
}

const bzColor = (bz: number): string => statusVar(bzStatus(bz))

export function SolarWindPanel() {
  const { data, isLoading, error } = useSolarWind()
  const updatedAt = useQueryClient().getQueryState(['solarWind'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Solar Wind" breathe>
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Solar Wind" breathe>
        <PanelState kind="unavailable" detail="The NOAA solar wind feed did not answer" />
      </GlassPanel>
    )
  }

  const kp = data.currentKp
  const sparklineReadings = data.kpReadings.map((r) => ({ observedTime: r.time, kpIndex: r.kp }))

  return (
    <GlassPanel variant="tile" label="Solar Wind" breathe>
      <DataAge updatedAt={updatedAt} />
      <div className={styles.solarWindPanel ?? ''}>
        <div className={styles.kpRow ?? ''}>
          <Readout
            value={kp !== null ? kp.toFixed(1) : '—'}
            tone={kp !== null ? kpStatus(kp) : 'default'}
            className={styles.kpValue ?? ''}
          />
          {kp !== null && (
            <div className={styles.kpMeta ?? ''}>
              <Label>Kp Index</Label>
              <span className={styles.auroraLabel ?? ''} style={{ color: kpColor(kp) }}>
                {auroraLabel(kp)}
              </span>
            </div>
          )}
        </div>

        <div className={styles.metricsRow ?? ''}>
          <div className={styles.metric ?? ''}>
            <Readout
              value={data.windSpeed !== null ? String(Math.round(data.windSpeed)) : '—'}
              unit="km/s"
              className={styles.metricValue ?? ''}
            />
            <Label>Wind Speed</Label>
            {data.windSpeedSeries.length > 1 && (
              <Sparkline
                values={data.windSpeedSeries}
                mode="line"
                height={SPARK_H}
                color="var(--signal)"
                ariaLabel="Wind speed trend, last 24 hours"
                className={styles.metricSpark ?? ''}
              />
            )}
          </div>
          <div className={styles.metric ?? ''}>
            <Readout
              value={
                data.imfBz !== null ? (data.imfBz >= 0 ? '+' : '') + data.imfBz.toFixed(1) : '—'
              }
              unit="nT"
              tone={data.imfBz !== null ? bzStatus(data.imfBz) : 'default'}
              className={styles.metricValue ?? ''}
            />
            <Label>IMF Bz</Label>
            {data.imfBzSeries.length > 1 && (
              <Sparkline
                values={data.imfBzSeries}
                mode="bars"
                height={SPARK_H}
                baseline={0}
                color={bzColor}
                ariaLabel="IMF Bz trend, last 24 hours"
                className={styles.metricSpark ?? ''}
              />
            )}
          </div>
          <div className={styles.metric ?? ''}>
            <Readout
              value={data.windDensity !== null ? data.windDensity.toFixed(1) : '—'}
              unit="p/cc"
              className={styles.metricValue ?? ''}
            />
            <Label>Density</Label>
            {data.windDensitySeries.length > 1 && (
              <Sparkline
                values={data.windDensitySeries}
                mode="line"
                height={SPARK_H}
                color="var(--copper-glow)"
                ariaLabel="Wind density trend, last 24 hours"
                className={styles.metricSpark ?? ''}
              />
            )}
          </div>
        </div>

        <KpSparkline readings={sparklineReadings} />
      </div>
    </GlassPanel>
  )
}
