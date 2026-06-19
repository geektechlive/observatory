import { useQueryClient } from '@tanstack/react-query'
import { useSpaceNews } from '@/hooks/useSpaceNews'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import { formatRelativeTime } from '@/lib/format'
import styles from './space-news-panel.module.css'

export function SpaceNewsPanel() {
  const { data, isLoading, error } = useSpaceNews()
  const updatedAt = useQueryClient().getQueryState(['space-news'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Mission Intel">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data || data.articles.length === 0) {
    return (
      <GlassPanel variant="tile" label="Mission Intel">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label="Mission Intel">
      <DataAge updatedAt={updatedAt} />
      <ol className={styles.list ?? ''}>
        {data.articles.slice(0, 7).map((a, i) => (
          <li key={`${a.url}-${i}`} className={styles.item ?? ''}>
            <a href={a.url} target="_blank" rel="noopener noreferrer" className={styles.link ?? ''}>
              <span className={styles.title ?? ''}>{a.title}</span>
              <span className={styles.meta ?? ''}>
                {a.site}
                {a.publishedAt && (
                  <span className={styles.time ?? ''}> · {formatRelativeTime(a.publishedAt)}</span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </GlassPanel>
  )
}
