import { useQueryClient } from '@tanstack/react-query'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { PanelState } from '@/components/ui/PanelState'
import { useSwpcAlerts } from '@/hooks/useSwpcAlerts'
import { formatRelativeTime } from '@/lib/format'
import { statusVar } from '@/lib/severity'

import styles from './swpc-alerts-panel.module.css'

// NOAA product codes: warnings and X-class are hazards, watches and alerts a watch,
// everything else telemetry.
function codeColor(productId: string): string {
  const p = productId.toUpperCase()
  if (p.startsWith('WAR') || p.includes('X') || p.startsWith('ALTX')) return statusVar('hazard')
  if (p.startsWith('WAT') || p.startsWith('ALT')) return statusVar('watch')
  return 'var(--signal)'
}

export function SwpcAlertsPanel() {
  const { data, isLoading, error } = useSwpcAlerts()
  const updatedAt = useQueryClient().getQueryState(['swpc-alerts'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="SWPC Alerts">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="SWPC Alerts">
        <PanelState kind="unavailable" detail="The NOAA SWPC alerts feed did not answer" />
      </GlassPanel>
    )
  }

  if (data.alerts.length === 0) {
    return (
      <GlassPanel variant="tile" label="SWPC Alerts">
        <PanelState kind="empty" detail="No active SWPC alerts" />
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
