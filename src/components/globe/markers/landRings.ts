import type { GeometryCollection, Topology } from 'topojson-specification'

export type Ring = [number, number][]

/**
 * Real coastline data, in a lazy chunk (#75): world-atlas land-110m plus topojson was
 * about 21 kB gzip of first-load JavaScript, for an SVG globe that WebGL replaces
 * moments later. The load starts at module import, so it runs alongside first paint.
 * GeoJSON is [lon, lat]; our project() takes (lat, lon) — swapped on import.
 */
const LAND_RINGS: Promise<Ring[]> = Promise.all([
  import('topojson-client'),
  import('world-atlas/land-110m.json'),
]).then(([topojson, land]) => {
  const topo = land.default as unknown as Topology<{ land: GeometryCollection }>
  const geo = topojson.feature(topo, topo.objects.land)
  const rings: Ring[] = []
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
})

let loaded: Ring[] | null = null
void LAND_RINGS.then((rings) => {
  loaded = rings
})

/** The land rings, once their chunk has loaded. */
export function landRings(): Promise<Ring[]> {
  return LAND_RINGS
}

/** The land rings if they have already loaded, else null. */
export function landRingsNow(): Ring[] | null {
  return loaded
}
