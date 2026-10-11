import { useQueryClient } from '@tanstack/react-query'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Sparkline } from '@/components/ui/Sparkline'
import { useGeomag } from '@/hooks/useGeomag'
import { bzStatus, dstStatus, statusVar } from '@/lib/severity'

import styles from './geomag-panel.module.css'

const dstColor = (dst: number): string => statusVar(dstStatus(dst))
const bzColor = (bz: number): string => statusVar(bzStatus(bz))
const DST_LABEL = { hazard: 'SEVERE STORM', watch: 'MODERATE STORM', nominal: 'QUIET' } as const
const dstLabel = (dst: number): string => DST_LABEL[dstStatus(dst)]

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
