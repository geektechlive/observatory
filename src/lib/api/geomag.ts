import type { Geomag } from '@/schemas/geomag'
import { GeomagSchema } from '@/schemas/geomag'

import { getJsonMeta, type SourceEnvelope } from './client'

export async function fetchGeomag(): Promise<Geomag> {
  const res = await fetch('/api/geomag')
  if (!res.ok) throw new Error(`Geomag fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return GeomagSchema.parse(json)
}

/**
 * Envelope variant used by useSourceQuery: carries the X-Data-Degraded and
 * X-Data-Age headers alongside the payload so the header can grade this source.
 */
export function fetchGeomagEnvelope(): Promise<SourceEnvelope<Geomag>> {
  return getJsonMeta('/api/geomag', GeomagSchema)
}
