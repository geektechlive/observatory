import type { PagesFunction } from '@cloudflare/workers-types'

// Additional tracked satellites via CelesTrak TLEs. Public, no key.
// These catalog numbers are stable (5-digit), unaffected by the 2026 rollover.
const SATS: { label: string; catnr: number }[] = [
  { label: 'Hubble', catnr: 20580 },
  { label: 'Tiangong', catnr: 48274 },
]
const CACHE_TTL_SECONDS = 86400 // 24h — TLEs refresh daily

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

function parseTle(text: string): { line1: string; line2: string } | null {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
  const l1 = lines.find((l) => l.startsWith('1 '))
  const l2 = lines.find((l) => l.startsWith('2 '))
  if (!l1 || !l2) return null
  return { line1: l1, line2: l2 }
}

async function fetchSat(
  label: string,
  catnr: number,
): Promise<{ name: string; line1: string; line2: string } | null> {
  try {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=TLE`)
    if (!res.ok) return null
    const tle = parseTle(await res.text())
    return tle ? { name: label, line1: tle.line1, line2: tle.line2 } : null
  } catch {
    return null
  }
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'celestrak:satellites:v1'

  const cached: string | null = await env.OBSERVATORY_CACHE.get(kvKey)
  if (cached !== null) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Cache-TTL': String(CACHE_TTL_SECONDS),
      },
    })
  }

  const results = await Promise.all(SATS.map((s) => fetchSat(s.label, s.catnr)))
  const satellites = results.filter((s): s is NonNullable<typeof s> => s !== null)

  if (satellites.length === 0) {
    return new Response(JSON.stringify({ error: 'No satellite TLEs available' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = JSON.stringify({ satellites, updatedAt: new Date().toISOString() })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
