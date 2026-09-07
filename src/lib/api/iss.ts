import type { IssTle } from '@/schemas/iss-tle'
import { IssTleSchema } from '@/schemas/iss-tle'

import { getJsonMeta, type SourceEnvelope } from './client'

export async function fetchIssTle(): Promise<IssTle> {
  const res = await fetch('/api/iss-tle')
  if (!res.ok) throw new Error(`ISS TLE fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return IssTleSchema.parse(json)
}

/**
 * Envelope variant used by useSourceQuery: carries the X-Data-Degraded and
 * X-Data-Age headers alongside the payload so the header can grade this source.
 */
export function fetchIssTleEnvelope(): Promise<SourceEnvelope<IssTle>> {
  return getJsonMeta('/api/iss-tle', IssTleSchema)
}
