import type { ZodType } from 'zod'

import { trackQuota } from '@/lib/api/quota'

/** Response header set by the Pages Function when it served stale/partial data. */
const HEADER_DEGRADED = 'X-Data-Degraded'
/** Age of the served payload, in seconds. */
const HEADER_AGE = 'X-Data-Age'
/** Only NASA-backed routes set this; quota tracking is skipped when absent. */
const HEADER_QUOTA = 'X-Quota-Remaining'

/** A non-2xx response. Carries the status so retry policy can branch on it. */
export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export interface SourceEnvelope<T> {
  data: T
  degraded: boolean
  dataAgeSeconds: number | null
}

function parseAge(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number.parseInt(raw, 10)
  return Number.isNaN(n) ? null : n
}

/**
 * Single fetch + validate path for every `/api/*` route. Replaces the fetch
 * boilerplate that was copy-pasted across the api modules, so a non-2xx now
 * throws a typed `HttpError` and a bad payload throws a `ZodError` instead of
 * silently flowing into the UI as an empty panel.
 */
export async function getJsonMeta<T>(
  url: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<SourceEnvelope<T>> {
  const res = await fetch(url, init)
  if (!res.ok) throw new HttpError(res.status, `Request failed (${res.status}): ${url}`)

  if (res.headers.get(HEADER_QUOTA) !== null) trackQuota(res)

  const degraded = res.headers.get(HEADER_DEGRADED) === '1'
  const dataAgeSeconds = parseAge(res.headers.get(HEADER_AGE))

  const json: unknown = await res.json()
  return { data: schema.parse(json), degraded, dataAgeSeconds }
}

export async function getJson<T>(url: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const { data } = await getJsonMeta(url, schema, init)
  return data
}
