import { useQueryClient } from '@tanstack/react-query'
import { useSwpcAlerts } from '@/hooks/useSwpcAlerts'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import { formatRelativeTime } from '@/lib/format'
import styles from './swpc-alerts-panel.module.css'

// First letter of the NOAA product code maps to a rough severity hue.
function codeColor(productId: string): string {
  const p = productId.toUpperCase()
  if (p.startsWith('WAR') || p.includes('X') || p.startsWith('ALTX')) return 'var(--magenta)'
  if (p.startsWith('WAT') || p.startsWith('ALT')) return 'var(--amber)'
  return 'var(--signal)'
}

export function SwpcAlertsPanel() {
  const { data, isLoading, error } = useSwpcAlerts()
  const updatedAt = useQueryClient().getQueryState(['swpc-alerts'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="SWPC Alerts">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data || data.alerts.length === 0) {
    return (
      <GlassPanel variant="tile" label="SWPC Alerts">
        <div className={styles.unavailable ?? ''}>No active alerts</div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label="SWPC Alerts">
      <DataAge updatedAt={updatedAt} />
      <ol className={styles.list ?? ''}>
        {data.alerts.slice(0, 6).map((a, i) => (
          <li key={`${a.productId}-${i}`} className={styles.item ?? ''}>
            <div className={styles.top ?? ''}>
              <span className={styles.code ?? ''} style={{ color: codeColor(a.productId) }}>
                {a.productId || 'SWPC'}
              </span>
              {a.issued && (
                <span className={styles.time ?? ''}>{formatRelativeTime(a.issued)}</span>
              )}
            </div>
            <span className={styles.summary ?? ''}>{a.summary}</span>
          </li>
        ))}
      </ol>
    </GlassPanel>
  )
}
