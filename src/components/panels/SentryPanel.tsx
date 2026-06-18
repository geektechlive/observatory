import { useQueryClient } from '@tanstack/react-query'
import { useSentry } from '@/hooks/useSentry'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import { formatPalermo, formatImpactProbability } from '@/lib/format'
import styles from './sentry-panel.module.css'

// Palermo Scale is logarithmic vs background risk; typical Sentry objects sit
// around −4..0. Map to a thermometer so relative hazard reads at a glance.
const PALERMO_MIN = -4
const PALERMO_MAX = 1

function palermoColor(ps: number): string {
  if (ps >= -1) return 'var(--magenta)'
  if (ps >= -2.5) return 'var(--amber)'
  return 'var(--cyan)'
}

function PalermoGauge({ value }: { value: string | null | undefined }) {
  const ps = value != null ? parseFloat(value) : NaN
  const valid = isFinite(ps)
  const t = valid ? Math.min(1, Math.max(0, (ps - PALERMO_MIN) / (PALERMO_MAX - PALERMO_MIN))) : 0
  const color = valid ? palermoColor(ps) : 'var(--ink-faint)'
  return (
    <div className={styles.gauge ?? ''}>
      <span className={styles.gaugeValue ?? ''} style={{ color }}>
        {formatPalermo(value ?? undefined)}
      </span>
      <span className={styles.gaugeTrack ?? ''} aria-hidden="true">
        <span
          className={styles.gaugeFill ?? ''}
          style={{ width: `${t * 100}%`, background: color }}
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
      const aPs = parseFloat(a.ps_cum ?? '') || -Infinity
      const bPs = parseFloat(b.ps_cum ?? '') || -Infinity
      return bPs - aPs
    })
    .slice(0, 8)

  const renderContent = () => {
    if (isLoading && !data) {
      return <div className={styles.loading ?? ''}>Loading...</div>
    }

    if (error || !data) {
      return <div className={styles.unavailable ?? ''}>Data unavailable</div>
    }

    if (sorted.length === 0) {
      return <div className={styles.empty ?? ''}>No objects in catalog</div>
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
