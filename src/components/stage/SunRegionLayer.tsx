// SWPC's numbered active regions marked on the SDO disc (#210). Lazy: it loads with the
// Sun view, never in the first load. The Active Regions panel carries the same data as
// text, so these marks are hidden from screen readers.
import { useSolarRegions } from '@/hooks/useSolarRegions'
import { discRadiusShare, regionOnDisc, tooOldToTurn } from '@/lib/sunDisc'
import type { ActiveRegion } from '@/schemas/solarRegions'

import styles from './sun-region-layer.module.css'

/** The stage zooms the SDO frame by this much to crop its burned-in stamp (sun-stage.module.css). */
export const IMAGE_ZOOM = 1.12

/** The round crop's radius in % of the disc box, less a mark's own half-width. */
const VISIBLE_RADIUS_PCT = 48
/** Two labels on the same side this close (in % of the box) would overlap. */
const CROWD_DX_PCT = 9
const CROWD_DY_PCT = 5

interface Props {
  wavelength: string
  /** When SDO took the image on screen; without it the positions can't be turned to it. */
  observed: string | null
}

interface Mark {
  region: number
  left: number
  top: number
  west: boolean
  below: boolean
}

/** Where each region's mark goes, dropping any the image doesn't show. */
function placeMarks(
  items: readonly ActiveRegion[],
  validAt: string,
  imageAt: Date,
  radius: number,
): Mark[] {
  const marks: Mark[] = []
  for (const r of items) {
    const p = regionOnDisc(r, validAt, imageAt)
    if (!p) continue
    const left = 50 + p.x * radius * 50
    const top = 50 - p.y * radius * 50
    // HMI's frame is zoomed past the round crop, so a limb region may not be in the picture.
    if (Math.hypot(left - 50, top - 50) > VISIBLE_RADIUS_PCT) continue
    const west = p.x > 0
    // A label crowding an earlier one on the same side goes below its mark instead.
    const below = marks.some(
      (m) =>
        !m.below &&
        m.west === west &&
        Math.abs(m.left - left) < CROWD_DX_PCT &&
        Math.abs(m.top - top) < CROWD_DY_PCT,
    )
    marks.push({ region: r.region, left, top, west, below })
  }
  return marks
}

export function SunRegionLayer({ wavelength, observed }: Props) {
  const { data } = useSolarRegions()
  const regions = data?.regions
  if (!regions || observed === null) return null

  const imageAt = new Date(observed)
  if (regions.items.length > 0 && tooOldToTurn(regions.validAt, imageAt)) {
    return (
      <div className={styles.layer ?? ''}>
        <p className={styles.stale ?? ''}>
          Region marks off: SWPC&apos;s positions are over two days old
        </p>
      </div>
    )
  }

  // Solar radius as a share of the disc box's half-width.
  const radius = discRadiusShare(wavelength, imageAt) * IMAGE_ZOOM
  const marks = placeMarks(regions.items, regions.validAt, imageAt, radius)

  return (
    <div className={styles.layer ?? ''} aria-hidden="true">
      {marks.map((m) => (
        <span
          key={m.region}
          data-region={String(m.region)}
          data-label={m.below ? 'below' : 'above'}
          // West of centre the label goes inward, or the round crop cuts it off.
          className={[styles.mark, m.west && styles.west, m.below && styles.below]
            .filter(Boolean)
            .join(' ')}
          style={{ left: `${m.left.toFixed(2)}%`, top: `${m.top.toFixed(2)}%` }}
        >
          <span className={styles.label ?? ''}>{m.region}</span>
        </span>
      ))}
    </div>
  )
}
