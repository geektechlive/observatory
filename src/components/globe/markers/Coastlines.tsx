import { memo, useMemo } from 'react'
import * as topojson from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import landTopo from 'world-atlas/land-110m.json'

import { coastPathData } from '../useGlobeProjection'

/**
 * Real coastline data — processed once at module load.
 * GeoJSON is [lon, lat]; our project() takes (lat, lon) — swapped on import.
 */
const LAND_RINGS: [number, number][][] = (() => {
  const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>
  const geo = topojson.feature(topo, topo.objects.land)
  const rings: [number, number][][] = []
  const features = 'features' in geo ? geo.features : [geo]
  for (const feature of features) {
    const geom = feature.geometry
    const polys =
      geom.type === 'Polygon'
        ? [geom.coordinates]
        : geom.type === 'MultiPolygon'
          ? geom.coordinates
          : []
    for (const poly of polys) {
      const ring = poly[0]
      if (!ring || ring.length < 6) continue
      rings.push(ring.map((coord) => [coord[1] ?? 0, coord[0] ?? 0] as [number, number]))
    }
  }
  return rings
})()

interface CoastlinesProps {
  rotation: number
  R: number
  strokeColor: string
  fillColor: string
}

/** Coastlines from world-atlas 110m. */
export const Coastlines = memo(function Coastlines({
  rotation,
  R,
  strokeColor,
  fillColor,
}: CoastlinesProps) {
  const coastData = useMemo(
    () => LAND_RINGS.map((ring) => coastPathData(ring, rotation, R)).filter((x) => x.d !== ''),
    [rotation, R],
  )
  return (
    <g stroke={strokeColor} strokeWidth="0.5" opacity="0.95">
      {coastData.map((item, i) => (
        <path
          key={`land${i}`}
          d={item.d}
          fill={item.full ? fillColor : 'none'}
          strokeWidth={item.full ? '0.4' : '0.8'}
        />
      ))}
    </g>
  )
})
