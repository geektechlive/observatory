import type { GeometryCollection, Topology } from 'topojson-specification'

export type Ring = [number, number][]

/**
 * Real coastline data, in a lazy chunk (#75): world-atlas land-110m plus topojson was
 * about 21 kB gzip of first-load JavaScript, for an SVG globe that WebGL replaces
 * moments later. The load starts on the first `landRings()` call, which the globe's
 * coastline layer makes as it mounts. It used to start at module import, and that
 * import is in the entry, so a direct #orrery load fetched the chunk for nothing (#167).
 * GeoJSON is [lon, lat]; our project() takes (lat, lon) — swapped on import.
 */
function loadLandRings(): Promise<Ring[]> {
  return Promise.all([import('topojson-client'), import('world-atlas/land-110m.json')]).then(
    ([topojson, land]) => {
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
    },
  )
}

let pending: Promise<Ring[]> | null = null
let loaded: Ring[] | null = null

/** The land rings, once their chunk has loaded. The first call starts the load. */
export function landRings(): Promise<Ring[]> {
  if (pending === null) {
    pending = loadLandRings().then((rings) => {
      loaded = rings
      return rings
    })
  }
  return pending
}

/** The land rings if they have already loaded, else null. */
export function landRingsNow(): Ring[] | null {
  return loaded
}
