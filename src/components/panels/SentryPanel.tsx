import { useQueryClient } from '@tanstack/react-query'
import { useSentry } from '@/hooks/useSentry'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { ScalePill } from '@/components/ui/ScalePill'
import { DataAge } from '@/components/ui/DataAge'
import { formatPalermo, formatImpactProbability } from '@/lib/format'
import styles from './sentry-panel.module.css'

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
                <ScalePill label={formatPalermo(obj.ps_cum)} variant="magenta" />
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
