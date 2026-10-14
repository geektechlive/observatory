import { eonetKind, ISS_HEX, LANES, primaryCategoryCounts } from '@/lib/palette'
import type { EonetEvent } from '@/schemas/eonet'

import styles from './map-legend.module.css'

interface MapLegendProps {
  events: EonetEvent[]
  issVisible: boolean
}

const CATEGORY_IDS = [
  'wildfires',
  'volcanoes',
  'earthquakes',
  'landslides',
  'drought',
  'severeStorms',
  'floods',
  'seaLakeIce',
] as const

const CATEGORIES = CATEGORY_IDS.map((id) => {
  const kind = eonetKind(id)
  return { id, label: kind.label, color: LANES[kind.lane].emit }
})

export function MapLegend({ events, issVisible }: MapLegendProps) {
  // Count by the category each dot is coloured by, so totals match what is drawn.
  const counts = primaryCategoryCounts(events)

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
          <span className={styles.dot ?? ''} style={{ background: ISS_HEX }} />
          <span className={styles.label ?? ''}>ISS</span>
        </div>
      )}
    </div>
  )
}
