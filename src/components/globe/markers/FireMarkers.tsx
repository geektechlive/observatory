import { memo, useMemo } from 'react'

import { circlePath, projectMany } from '../useGlobeProjection'

export interface GlobeFire {
  lat: number
  lon: number
  /** Fire Radiative Power, MW. */
  frp: number
}

/** FIRMS active fires: hot-body ramp by Fire Radiative Power (MW). */
function fireColor(frp: number): string {
  if (frp >= 100) return 'oklch(0.95 0.06 90)' // white-hot
  if (frp >= 30) return 'oklch(0.85 0.2 55)' // bright orange
  return 'oklch(0.72 0.2 35)' // ember
}

const HOT_FRP = 50
const HOT_RADIUS = 1.8
const COOL_RADIUS = 1.2

interface FireBatch {
  key: string
  d: string
  fill: string
}

interface FireMarkersProps {
  fires: readonly GlobeFire[]
  rotation: number
  R: number
}

/**
 * FIRMS can return well over a thousand hotspots. One `<circle>` each meant
 * React reconciled 1000+ SVG nodes on every rotation tick, so the dots are
 * batched into at most six `<path>` nodes, one per (color, radius) bucket.
 * Same fill, same radius, same z-order as before; only the node count changes.
 */
export const FireMarkers = memo(function FireMarkers({ fires, rotation, R }: FireMarkersProps) {
  const batches = useMemo<FireBatch[]>(() => {
    const byKey = new Map<string, FireBatch>()
    for (const { point: f, x, y } of projectMany(fires, rotation, R)) {
      const fill = fireColor(f.frp)
      const r = f.frp >= HOT_FRP ? HOT_RADIUS : COOL_RADIUS
      const key = `${fill}|${r}`
      const existing = byKey.get(key)
      if (existing) {
        existing.d += circlePath(x, y, r)
      } else {
        byKey.set(key, { key, d: circlePath(x, y, r), fill })
      }
    }
    return [...byKey.values()]
  }, [fires, rotation, R])

  return (
    <>
      {batches.map((b) => (
        <path key={b.key} d={b.d} fill={b.fill} opacity={0.85} pointerEvents="none" />
      ))}
    </>
  )
})
