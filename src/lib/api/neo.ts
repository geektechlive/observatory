import { type NeoResponse, NeoResponseSchema } from '@/schemas/neo'

import { getJsonMeta, type SourceEnvelope } from './client'
import { trackQuota } from './quota'

export async function fetchNeo(): Promise<NeoResponse> {
  const res = await fetch('/api/neo')
  if (!res.ok) throw new Error(`NeoWs fetch failed: ${res.status}`)
  trackQuota(res)
  const data: unknown = await res.json()
  return NeoResponseSchema.parse(data)
}

/**
 * Envelope variant used by useSourceQuery: carries the X-Data-Degraded and
 * X-Data-Age headers alongside the payload so the header can grade this source.
 */
export function fetchNeoEnvelope(): Promise<SourceEnvelope<NeoResponse>> {
  return getJsonMeta('/api/neo', NeoResponseSchema)
}
