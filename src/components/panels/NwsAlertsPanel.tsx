import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { PanelState } from '@/components/ui/PanelState'
import { useNwsAlerts } from '@/hooks/useNwsAlerts'
import { nwsStatus, type NwsTier, type Status, statusVar } from '@/lib/severity'
import type { NwsFeature } from '@/schemas/nws'

import styles from './nws-alerts-panel.module.css'

const TITLE = 'Weather alerts, US'
const MAX_ROWS = 4

const RANK: Record<NwsTier, number> = { extreme: 0, severe: 1, moderate: 2, minor: 3, unknown: 4 }

const diamond = '12,2 22,12 12,22 2,12'
const triangle = '12,3 22,21 2,21'

/** Status-scale glyphs: circle nominal, triangle watch, diamond hazard (filled when extreme). */
function Glyph({ tier, status }: { tier: NwsTier; status: Status }) {
  const color = statusVar(status)
  const filled = tier === 'extreme'
  const paint = { fill: filled ? color : 'none', stroke: color, strokeWidth: 2 }
  return (
    <svg className={styles.glyph ?? ''} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {status === 'hazard' && <polygon points={diamond} {...paint} />}
      {status === 'watch' && <polygon points={triangle} {...paint} />}
      {status === 'nominal' && <circle cx="12" cy="12" r="9" {...paint} />}
    </svg>
  )
}

function rank(
  alerts: readonly NwsFeature[],
): { alert: NwsFeature; tier: NwsTier; status: Status }[] {
  return alerts
    .map((alert) => ({ alert, ...nwsStatus(alert.severity) }))
    .sort((a, b) => RANK[a.tier] - RANK[b.tier])
    .slice(0, MAX_ROWS)
}

export function NwsAlertsPanel() {
  const { data, isLoading, error } = useNwsAlerts(true)

  if (isLoading) {
    return (
      <GlassPanel variant="tile" label={TITLE}>
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label={TITLE}>
        <PanelState kind="unavailable" detail="The National Weather Service feed did not answer" />
      </GlassPanel>
    )
  }

  if (data.features.length === 0) {
    return (
      <GlassPanel variant="tile" label={TITLE}>
        <PanelState kind="empty" detail="No active US weather alerts" />
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label={TITLE}>
      <DataAge updatedAt={Date.parse(data.updatedAt)} />
      <ul className={styles.list ?? ''}>
        {rank(data.features).map(({ alert, tier, status }, i) => (
          <li key={`${alert.event}-${String(i)}`} className={styles.row ?? ''} data-tier={tier}>
            <Glyph tier={tier} status={status} />
            <div className={styles.text ?? ''}>
              <div className={styles.line ?? ''}>
                <span className={styles.severity ?? ''}>
                  {tier === 'unknown' ? 'Alert' : alert.severity}
                </span>
                <span className={styles.event ?? ''}>{alert.event}</span>
              </div>
              <span className={styles.area ?? ''}>{alert.headline}</span>
            </div>
          </li>
        ))}
      </ul>
    </GlassPanel>
  )
}
