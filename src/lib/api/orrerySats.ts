import type { SatGroupId } from '@/lib/orbit/satCatalog'

import { apiFetch, HttpError } from './client'

export interface OrrerySatsBody {
  /** The /api/orrery-sats body, undecoded: the satellite worker parses and checks it. */
  body: ArrayBuffer
  degraded: boolean
  dataAgeSeconds: number | null
}

/**
 * One stored CelesTrak group for the orrery (#98). Unlike getJsonMeta it does not parse:
 * a Starlink group is 1.7 MB of JSON, so the bytes go to the worker by transfer and are
 * decoded and checked there (decodeSatGroup, OrrerySatsSchema).
 */
export async function fetchOrrerySatsBody(group: SatGroupId): Promise<OrrerySatsBody> {
  const url = `/api/orrery-sats?group=${group}`
  const res = await apiFetch(url, undefined)
  if (!res.ok)
    throw new HttpError(res.status, `Request failed (${String(res.status)}): ${url}`, res)
  const age = Number.parseInt(res.headers.get('X-Data-Age') ?? '', 10)
  return {
    body: await res.arrayBuffer(),
    degraded: res.headers.get('X-Data-Degraded') === '1',
    dataAgeSeconds: Number.isNaN(age) ? null : age,
  }
}
