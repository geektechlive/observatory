import { QuakesResponseSchema } from '@/schemas/quakes'
import type { QuakesResponse } from '@/schemas/quakes'

export async function fetchQuakes(): Promise<QuakesResponse> {
  const res = await fetch('/api/quakes')
  if (!res.ok) throw new Error(`Quakes fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return QuakesResponseSchema.parse(json)
}
