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
  { id: 'wildfires', label: 'Wildfire', color: 'oklch(0.70 0.22 28)' },
  { id: 'severeStorms', label: 'Storm', color: 'var(--signal)' },
  { id: 'earthquakes', label: 'Earthquake', color: 'var(--amber)' },
  { id: 'volcanoes', label: 'Volcano', color: 'var(--copper-glow)' },
  { id: 'floods', label: 'Flood', color: 'oklch(0.75 0.18 240)' },
  { id: 'landslides', label: 'Landslide', color: 'var(--copper)' },
  { id: 'seaLakeIce', label: 'Sea Ice', color: 'oklch(0.88 0.06 200)' },
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
      <div className={styles.heading ?? ''}>EONET · LIVE</div>
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
          <span className={styles.dot ?? ''} style={{ background: 'var(--signal)' }} />
          <span className={styles.label ?? ''}>ISS</span>
        </div>
      )}
    </div>
  )
}
