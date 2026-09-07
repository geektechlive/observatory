import { type LaunchesResponse, LaunchesResponseSchema } from '@/schemas/launches'

import { getJsonMeta, type SourceEnvelope } from './client'

export async function fetchLaunches(): Promise<LaunchesResponse> {
  const res = await fetch('/api/launches')
  if (!res.ok) throw new Error(`Launches fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return LaunchesResponseSchema.parse(data)
}

/**
 * Envelope variant used by useSourceQuery: carries the X-Data-Degraded and
 * X-Data-Age headers alongside the payload so the header can grade this source.
 */
export function fetchLaunchesEnvelope(): Promise<SourceEnvelope<LaunchesResponse>> {
  return getJsonMeta('/api/launches', LaunchesResponseSchema)
}
