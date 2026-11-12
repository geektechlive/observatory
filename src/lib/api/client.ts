import type { ZodType } from 'zod'

import { trackQuota } from '@/lib/api/quota'

/** Response header set by the Pages Function when it served stale/partial data. */
const HEADER_DEGRADED = 'X-Data-Degraded'
/** Age of the served payload, in seconds. */
const HEADER_AGE = 'X-Data-Age'
/** Only NASA-backed routes set this; quota tracking is skipped when absent. */
const HEADER_QUOTA = 'X-Quota-Remaining'
/** `REVALIDATING`: an expired entry, answered at once while the server refreshes it (#83). */
const HEADER_CACHE = 'X-Cache'
/** `contract` or `upstream`: why a Function answered an error (functions/api/_cache.ts). */
const HEADER_ERROR_KIND = 'X-Error-Kind'

let revalidatingListener: (() => void) | null = null

/** Who to tell when an answer came from an entry the server is still refreshing. */
export function onRevalidating(listener: (() => void) | null): void {
  revalidatingListener = listener
}

/**
 * `fetch` for our own `/api/*` routes. It notices an old answer the server is refreshing
 * behind it, so the app can ask again once the fresh copy has landed.
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.headers.get(HEADER_CACHE) === 'REVALIDATING') revalidatingListener?.()
  return res
}

/**
 * Retry-After as delta-seconds, or null. Only seconds: our middleware sends `60`, the zone
 * rule sends none, and an HTTP date falls back to the retry's 61 s floor.
 */
function parseRetryAfter(raw: string | null): number | null {
  const s = raw === null || raw.trim() === '' ? NaN : Number(raw)
  return s >= 0 ? s : null
}

/**
 * A non-2xx response. Carries what retry policy branches on (#218): the status, a 429's
 * `Retry-After`, and whether the answer is the server's 60 s negative entry
 * (`X-Cache: NEG`), which a quick retry would only replay.
 */
export class HttpError extends Error {
  status: number
  retryAfterS: number | null
  negCached: boolean
  /** `X-Error-Kind: contract`: the upstream's payload broke our schema, so a retry can't help. */
  contract: boolean

  constructor(status: number, message: string, res?: Response) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.retryAfterS = parseRetryAfter(res?.headers.get('Retry-After') ?? null)
    this.negCached = res?.headers.get(HEADER_CACHE) === 'NEG'
    this.contract = res?.headers.get(HEADER_ERROR_KIND) === 'contract'
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
  const res = await apiFetch(url, init)
  if (!res.ok) throw new HttpError(res.status, `Request failed (${res.status}): ${url}`, res)

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
