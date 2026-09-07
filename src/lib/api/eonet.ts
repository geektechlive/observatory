import type { EonetResponse } from '@/schemas/eonet'
import { EonetResponseSchema } from '@/schemas/eonet'

import { getJsonMeta, type SourceEnvelope } from './client'

export async function fetchEonetEvents(): Promise<EonetResponse> {
  const res = await fetch('/api/eonet')
  if (!res.ok) throw new Error(`EONET fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return EonetResponseSchema.parse(json)
}

/**
 * Envelope variant used by useSourceQuery: carries the X-Data-Degraded and
 * X-Data-Age headers alongside the payload so the header can grade this source.
 */
export function fetchEonetEventsEnvelope(): Promise<SourceEnvelope<EonetResponse>> {
  return getJsonMeta('/api/eonet', EonetResponseSchema)
}
