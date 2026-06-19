import { useQueryClient } from '@tanstack/react-query'
import { useGeomag } from '@/hooks/useGeomag'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import { Sparkline } from '@/components/ui/Sparkline'
import styles from './geomag-panel.module.css'

function dstColor(dst: number): string {
  if (dst <= -100) return 'var(--magenta)'
  if (dst <= -50) return 'var(--amber)'
  if (dst <= -30) return 'var(--copper-glow)'
  return 'var(--cyan)'
}
function bzColor(bz: number): string {
  return bz < 0 ? 'var(--amber)' : 'var(--terminal)'
}
function dstLabel(dst: number): string {
  if (dst <= -100) return 'SEVERE STORM'
  if (dst <= -50) return 'MODERATE STORM'
  if (dst <= -30) return 'STORM WATCH'
  return 'QUIET'
}

export function GeomagPanel() {
  const { data, isLoading, error } = useGeomag()
  const updatedAt = useQueryClient().getQueryState(['geomag'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Geomagnetic">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Geomagnetic">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const dst = data.currentDst
  const bz = data.currentBz

  return (
    <GlassPanel variant="tile" label="Geomagnetic">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.panel ?? ''}>
        <div className={styles.metric ?? ''}>
          <div className={styles.head ?? ''}>
            <span
              className={styles.value ?? ''}
              style={{ color: dst !== null ? dstColor(dst) : undefined }}
            >
              {dst !== null ? dst : '—'}
              <span className={styles.unit ?? ''}>nT</span>
            </span>
            <div className={styles.meta ?? ''}>
              <span className={styles.name ?? ''}>Dst index</span>
              {dst !== null && (
                <span className={styles.tag ?? ''} style={{ color: dstColor(dst) }}>
                  {dstLabel(dst)}
                </span>
              )}
            </div>
          </div>
          {data.dstSeries.length > 1 && (
            <Sparkline
              values={data.dstSeries}
              mode="line"
              height={28}
              color={dst !== null ? dstColor(dst) : 'var(--cyan)'}
              thresholds={[{ value: -50, color: 'var(--amber)' }]}
              ariaLabel="Dst index trend"
            />
          )}
        </div>

        <div className={styles.metric ?? ''}>
          <div className={styles.head ?? ''}>
            <span
              className={styles.value ?? ''}
              style={{ color: bz !== null ? bzColor(bz) : undefined }}
            >
              {bz !== null ? (bz >= 0 ? '+' : '') + bz.toFixed(1) : '—'}
              <span className={styles.unit ?? ''}>nT</span>
            </span>
            <div className={styles.meta ?? ''}>
              <span className={styles.name ?? ''}>IMF Bz · L1</span>
              <span className={styles.tag ?? ''} style={{ color: 'var(--ink-faint)' }}>
                {bz !== null && bz < 0 ? 'SOUTHWARD' : 'NORTHWARD'}
              </span>
            </div>
          </div>
          {data.bzSeries.length > 1 && (
            <Sparkline
              values={data.bzSeries}
              mode="bars"
              height={28}
              baseline={0}
              color={bzColor}
              ariaLabel="IMF Bz trend"
            />
          )}
        </div>
      </div>
    </GlassPanel>
  )
}
