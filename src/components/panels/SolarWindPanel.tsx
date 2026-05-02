import { useQueryClient } from '@tanstack/react-query'
import { useSolarWind } from '@/hooks/useSolarWind'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import { KpSparkline } from './KpSparkline'
import styles from './solar-wind-panel.module.css'

function kpColor(kp: number): string {
  if (kp >= 6) return 'var(--magenta)'
  if (kp >= 4) return 'var(--amber)'
  return 'var(--cyan)'
}

function auroraLabel(kp: number): string {
  if (kp <= 1) return 'QUIET'
  if (kp <= 2) return 'UNSETTLED'
  if (kp <= 3) return 'ACTIVE'
  if (kp <= 5) return 'MINOR STORM'
  if (kp <= 7) return 'MODERATE STORM'
  if (kp <= 8) return 'STRONG STORM'
  return 'EXTREME STORM'
}

function bzColor(bz: number): string {
  return bz < 0 ? 'var(--amber)' : 'var(--green)'
}

export function SolarWindPanel() {
  const { data, isLoading, error } = useSolarWind()
  const updatedAt = useQueryClient().getQueryState(['solarWind'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Solar Wind" breathe>
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Solar Wind" breathe>
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
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
          {kp !== null ? (
            <>
              <span className={styles.kpValue ?? ''} style={{ color: kpColor(kp) }}>
                {kp.toFixed(1)}
              </span>
              <div className={styles.kpMeta ?? ''}>
                <span className={styles.kpLabel ?? ''}>Kp Index</span>
                <span className={styles.auroraLabel ?? ''} style={{ color: kpColor(kp) }}>
                  {auroraLabel(kp)}
                </span>
              </div>
            </>
          ) : (
            <span className={styles.kpValue ?? ''} style={{ color: 'var(--ink-faint)' }}>
              —
            </span>
          )}
        </div>

        <div className={styles.metricsRow ?? ''}>
          <div className={styles.metric ?? ''}>
            <span className={styles.metricValue ?? ''}>
              {data.windSpeed !== null ? Math.round(data.windSpeed) : '—'}
            </span>
            <span className={styles.metricLabel ?? ''}>km/s</span>
            <span className={styles.metricName ?? ''}>Wind Speed</span>
          </div>
          <div className={styles.metric ?? ''}>
            <span
              className={styles.metricValue ?? ''}
              style={{ color: data.imfBz !== null ? bzColor(data.imfBz) : undefined }}
            >
              {data.imfBz !== null ? (data.imfBz >= 0 ? '+' : '') + data.imfBz.toFixed(1) : '—'}
            </span>
            <span className={styles.metricLabel ?? ''}>nT</span>
            <span className={styles.metricName ?? ''}>IMF Bz</span>
          </div>
          <div className={styles.metric ?? ''}>
            <span className={styles.metricValue ?? ''}>
              {data.windDensity !== null ? data.windDensity.toFixed(1) : '—'}
            </span>
            <span className={styles.metricLabel ?? ''}>p/cc</span>
            <span className={styles.metricName ?? ''}>Density</span>
          </div>
        </div>

        <KpSparkline readings={sparklineReadings} />
      </div>
    </GlassPanel>
  )
}
