import { apiFetch } from '@/lib/api/client'
import type { SatellitesResponse } from '@/schemas/satellites'
import { SatellitesResponseSchema } from '@/schemas/satellites'

export async function fetchSatellites(): Promise<SatellitesResponse> {
  const res = await apiFetch('/api/satellites')
  if (!res.ok) throw new Error(`Satellites fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return SatellitesResponseSchema.parse(json)
}
