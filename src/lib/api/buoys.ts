import { BuoysResponseSchema } from '@/schemas/buoys'
import type { BuoysResponse } from '@/schemas/buoys'

export async function fetchBuoys(): Promise<BuoysResponse> {
  const res = await fetch('/api/buoys')
  if (!res.ok) throw new Error(`Buoys fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return BuoysResponseSchema.parse(json)
}
