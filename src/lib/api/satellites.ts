import { SatellitesResponseSchema } from '@/schemas/satellites'
import type { SatellitesResponse } from '@/schemas/satellites'

export async function fetchSatellites(): Promise<SatellitesResponse> {
  const res = await fetch('/api/satellites')
  if (!res.ok) throw new Error(`Satellites fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return SatellitesResponseSchema.parse(json)
}
