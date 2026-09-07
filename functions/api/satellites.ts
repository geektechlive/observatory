import type { PagesFunction } from '@cloudflare/workers-types'

import { SatellitesResponseSchema } from '../../src/schemas/satellites'
import type { CacheableResult } from './_cache'
import { cachedJson, fetchUpstream } from './_cache'
import type { KvReader } from './iss-tle'
import { DEGRADED_TTL_SECONDS, FRESH_TTL_SECONDS, readKvEnvelope } from './iss-tle'

// Same KV-first strategy as iss-tle.ts (see the comment block there). The KV-envelope
// helper is imported rather than duplicated so both endpoints agree on the freshness
// window and the envelope shape. This handler never writes KV.

/**
 * Tracked satellites. SOURCE OF TRUTH for scripts/refresh-data.mjs, which extracts
 * these entries by regex at build time. Keep the literal
 * `{ label: '...', catnr: 12345 }` formatting so that regex keeps matching.
 * These catalog numbers are stable 5-digit values, unaffected by the 2026 rollover.
 */
export const SATS: { label: string; catnr: number }[] = [
  { label: 'Hubble', catnr: 20580 },
  { label: 'Tiangong', catnr: 48274 },
]

/** KV key written by scripts/refresh-data.mjs. */
export const KV_SATELLITES_KEY = 'tle:satellites:v1'

const LIVE_TIMEOUT_MS = 10_000

/** Record shape stored inside the KV envelope's `data` array. */
export interface KvSatelliteRecord {
  label: string
  catnr: number
  name: string
  line1: string
  line2: string
}

type FetchUpstream = typeof fetchUpstream

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

/**
 * Turn stored KV records into the public response body. Returns null when nothing
 * usable is present, so the caller can move on to the next fallback tier.
 */
export function buildSatellitesBody(records: unknown, updatedAt: string): string | null {
  if (!Array.isArray(records)) return null

  const satellites: { name: string; line1: string; line2: string }[] = []
  for (const entry of records as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Partial<KvSatelliteRecord>
    if (typeof record.line1 !== 'string' || typeof record.line2 !== 'string') continue
    const name =
      typeof record.label === 'string'
        ? record.label
        : typeof record.name === 'string'
          ? record.name
          : null
    if (name === null) continue
    satellites.push({ name, line1: record.line1, line2: record.line2 })
  }
  if (satellites.length === 0) return null

  const validated = SatellitesResponseSchema.safeParse({ satellites, updatedAt })
  return validated.success ? JSON.stringify(validated.data) : null
}

async function fetchSatLive(
  label: string,
  catnr: number,
  fetchImpl: FetchUpstream,
): Promise<{ name: string; line1: string; line2: string } | null> {
  try {
    const res = await fetchImpl(
      `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=TLE`,
      undefined,
      { timeoutMs: LIVE_TIMEOUT_MS },
    )
    if (!res.ok) return null
    const lines = (await res.text())
      .trim()
      .split('\n')
      .map((l) => l.trim())
    const line1 = lines.find((l) => l.startsWith('1 '))
    const line2 = lines.find((l) => l.startsWith('2 '))
    if (!line1 || !line2) return null
    return { name: label, line1, line2 }
  } catch {
    return null
  }
}

/**
 * Build the /api/satellites payload. Exported so tests can drive every branch with a
 * fake KV and a fake fetch, without stubbing the Cache API.
 */
export async function produceSatellites(
  kv: KvReader | undefined,
  fetchImpl: FetchUpstream = fetchUpstream,
  now: number = Date.now(),
): Promise<CacheableResult> {
  const cached = await readKvEnvelope<unknown>(kv, KV_SATELLITES_KEY, now)

  if (cached && cached.fresh) {
    const body = buildSatellitesBody(cached.data, cached.fetchedAt)
    if (body !== null) {
      return {
        body,
        ttl: FRESH_TTL_SECONDS,
        extraHeaders: {
          'X-Data-Source': 'kv',
          'X-Data-Age': String(cached.ageSeconds),
        },
      }
    }
  }

  // Best-effort live path. Two subrequests, well inside the 50-per-invocation limit.
  const results = await Promise.all(SATS.map((s) => fetchSatLive(s.label, s.catnr, fetchImpl)))
  const live = results.filter((s): s is NonNullable<typeof s> => s !== null)
  if (live.length > 0) {
    const nowIso = new Date(now).toISOString()
    const validated = SatellitesResponseSchema.safeParse({ satellites: live, updatedAt: nowIso })
    if (validated.success) {
      return {
        body: JSON.stringify(validated.data),
        ttl: FRESH_TTL_SECONDS,
        extraHeaders: { 'X-Data-Source': 'live', 'X-Data-Age': '0' },
      }
    }
  }

  if (cached) {
    const body = buildSatellitesBody(cached.data, cached.fetchedAt)
    if (body !== null) {
      return {
        body,
        ttl: DEGRADED_TTL_SECONDS,
        degraded: true,
        extraHeaders: {
          'X-Data-Source': 'kv-stale',
          'X-Data-Age': String(cached.ageSeconds),
        },
      }
    }
  }

  // Nothing anywhere. Serve an empty list rather than a 5xx so the map keeps working
  // with just the ISS, and mark it degraded so the health check flags it.
  return {
    body: JSON.stringify({ satellites: [], updatedAt: new Date(now).toISOString() }),
    ttl: DEGRADED_TTL_SECONDS,
    degraded: true,
    extraHeaders: { 'X-Data-Source': 'fallback' },
  }
}

export const onRequest: PagesFunction<Env> = (ctx) =>
  cachedJson(ctx, 'celestrak:satellites:v1', FRESH_TTL_SECONDS, () =>
    produceSatellites(ctx.env.OBSERVATORY_CACHE),
  )
