import type { QuakesResponse } from '@/schemas/quakes'
import { QuakesResponseSchema } from '@/schemas/quakes'

import { getJsonMeta, type SourceEnvelope } from './client'

export async function fetchQuakes(): Promise<QuakesResponse> {
  const res = await fetch('/api/quakes')
  if (!res.ok) throw new Error(`Quakes fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return QuakesResponseSchema.parse(json)
}

/**
 * Envelope variant used by useSourceQuery: carries the X-Data-Degraded and
 * X-Data-Age headers alongside the payload so the header can grade this source.
 */
export function fetchQuakesEnvelope(): Promise<SourceEnvelope<QuakesResponse>> {
  return getJsonMeta('/api/quakes', QuakesResponseSchema)
}
