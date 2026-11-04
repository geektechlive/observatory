import { apiFetch } from '@/lib/api/client'
import type { BuoysResponse } from '@/schemas/buoys'
import { BuoysResponseSchema } from '@/schemas/buoys'

export async function fetchBuoys(): Promise<BuoysResponse> {
  const res = await apiFetch('/api/buoys')
  if (!res.ok) throw new Error(`Buoys fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return BuoysResponseSchema.parse(json)
}
