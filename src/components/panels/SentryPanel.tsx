import { useQueryClient } from '@tanstack/react-query'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { useSentry } from '@/hooks/useSentry'
import { formatImpactProbability, formatPalermo } from '@/lib/format'
import { palermoStatus, type Status, statusVar } from '@/lib/severity'

import styles from './sentry-panel.module.css'

// Palermo Scale is logarithmic vs background risk; typical Sentry objects sit
// around −4..0. Map to a thermometer so relative hazard reads at a glance.
const PALERMO_MIN = -4
const PALERMO_MAX = 1

/** Palermo as a number; missing or unparseable is NaN. 0 is a real (serious) value. */
function palermoOf(raw: string | null | undefined): number {
  return raw != null ? parseFloat(raw) : NaN
}

function PalermoGauge({ value }: { value: string | null | undefined }) {
  const ps = palermoOf(value)
  const valid = isFinite(ps)
  const t = valid ? Math.min(1, Math.max(0, (ps - PALERMO_MIN) / (PALERMO_MAX - PALERMO_MIN))) : 0
  const status: Status | null = valid ? palermoStatus(ps) : null
  return (
    <div className={styles.gauge ?? ''}>
      <Readout
        value={formatPalermo(value ?? undefined)}
        tone={status ?? undefined}
        className={styles.gaugeValue ?? ''}
      />
      <span className={styles.gaugeTrack ?? ''} aria-hidden="true">
        <span
          className={styles.gaugeFill ?? ''}
          style={{ width: `${t * 100}%`, background: statusVar(status) }}
        />
      </span>
    </div>
  )
}

export function SentryPanel() {
  const { data, isLoading, error } = useSentry()
  const updatedAt = useQueryClient().getQueryState(['sentry'])?.dataUpdatedAt ?? 0

  const sorted = [...(data?.data ?? [])]
    .sort((a, b) => {
      const aPs = palermoOf(a.ps_cum)
      const bPs = palermoOf(b.ps_cum)
      return (isNaN(bPs) ? -Infinity : bPs) - (isNaN(aPs) ? -Infinity : aPs)
    })
    .slice(0, 8)

  const renderContent = () => {
    if (isLoading && !data) {
      return <PanelState kind="loading" />
    }

    if (error || !data) {
      return <PanelState kind="unavailable" detail="JPL Sentry is not answering" />
    }

    if (sorted.length === 0) {
      return <PanelState kind="empty" detail="No objects in the Sentry catalog" />
    }

    return (
      <table className={styles.table ?? ''}>
        <caption className={styles.caption ?? ''}>
          Impact Risk Objects · Top {sorted.length}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={styles.th ?? ''}>
              Designation
            </th>
            <th scope="col" className={`${styles.th ?? ''} ${styles.thRight ?? ''}`}>
              Palermo
            </th>
            <th scope="col" className={`${styles.th ?? ''} ${styles.thRight ?? ''}`}>
              Impact %
            </th>
            <th scope="col" className={`${styles.th ?? ''} ${styles.thRight ?? ''}`}>
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((obj) => (
            <tr key={obj.des}>
              <td
                className={`${styles.td ?? ''} ${styles.des ?? ''}`}
                title={obj.fullname ?? obj.name ?? obj.des}
              >
                {obj.fullname ?? obj.name ?? obj.des}
              </td>
              <td className={`${styles.td ?? ''} ${styles.tdRight ?? ''}`}>
                <PalermoGauge value={obj.ps_cum} />
              </td>
              <td className={`${styles.td ?? ''} ${styles.tdRight ?? ''}`}>
                {formatImpactProbability(obj.ip)}
              </td>
              <td className={`${styles.td ?? ''} ${styles.tdRight ?? ''} ${styles.count ?? ''}`}>
                {obj.n_imp ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <GlassPanel variant="tile" label="Sentry">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.sentryPanel ?? ''}>{renderContent()}</div>
    </GlassPanel>
  )
}
