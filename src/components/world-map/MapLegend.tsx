import type { EonetEvent } from '@/schemas/eonet'
import styles from './map-legend.module.css'

interface MapLegendProps {
  events: EonetEvent[]
  issVisible: boolean
}

interface CategoryDef {
  id: string
  label: string
  color: string
}

const CATEGORIES: CategoryDef[] = [
  { id: 'wildfires', label: 'Wildfires', color: '#fb7185' },
  { id: 'severeStorms', label: 'Severe Storms', color: '#fbbf24' },
  { id: 'earthquakes', label: 'Earthquakes', color: '#f472b6' },
  { id: 'volcanoes', label: 'Volcanoes', color: '#fb923c' },
  { id: 'floods', label: 'Floods', color: '#67e8f9' },
  { id: 'landslides', label: 'Landslides', color: '#a78bfa' },
]

export function MapLegend({ events, issVisible }: MapLegendProps) {
  const counts = new Map<string, number>()
  for (const event of events) {
    for (const cat of event.categories) {
      counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1)
    }
  }

  const activeCategories = CATEGORIES.filter((c) => (counts.get(c.id) ?? 0) > 0)
  const showDivider = activeCategories.length > 0 && issVisible

  if (activeCategories.length === 0 && !issVisible) return null

  return (
    <div className={styles.legend ?? ''}>
      {activeCategories.map((cat) => (
        <div key={cat.id} className={styles.row ?? ''}>
          <span className={styles.dot ?? ''} style={{ background: cat.color }} />
          <span className={styles.label ?? ''}>{cat.label}</span>
          <span className={styles.count ?? ''}>{counts.get(cat.id) ?? 0}</span>
        </div>
      ))}
      {showDivider && <div className={styles.divider ?? ''} />}
      {issVisible && <div className={styles.sectionLabel ?? ''}>Sky</div>}
      {issVisible && (
        <div className={styles.row ?? ''}>
          <span className={styles.dot ?? ''} style={{ background: '#7dd3fc' }} />
          <span className={styles.label ?? ''}>ISS</span>
        </div>
      )}
    </div>
  )
}
