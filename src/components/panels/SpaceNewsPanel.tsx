import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { PanelState } from '@/components/ui/PanelState'
import { useSpaceNews } from '@/hooks/useSpaceNews'
import { formatRelativeTime } from '@/lib/format'
import { panelView } from '@/lib/panelView'

import styles from './space-news-panel.module.css'

export function SpaceNewsPanel() {
  const query = useSpaceNews()
  const view = panelView(query, 'space-news')

  if (view.kind === 'loading') {
    return (
      <GlassPanel variant="tile" label="Mission Intel">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (view.kind === 'unavailable' || view.data.articles.length === 0) {
    return (
      <GlassPanel variant="tile" label="Mission Intel">
        <PanelState kind="unavailable" detail="The space news feed did not answer" />
      </GlassPanel>
    )
  }

  const { data, age } = view

  return (
    <GlassPanel variant="tile" label="Mission Intel">
      <DataAge {...age} />
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
