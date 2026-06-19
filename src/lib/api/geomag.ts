import { GeomagSchema } from '@/schemas/geomag'
import type { Geomag } from '@/schemas/geomag'

export async function fetchGeomag(): Promise<Geomag> {
  const res = await fetch('/api/geomag')
  if (!res.ok) throw new Error(`Geomag fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return GeomagSchema.parse(json)
}
