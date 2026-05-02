import type { PagesFunction } from '@cloudflare/workers-types'
import { IssTleSchema } from '../../src/schemas/iss-tle'

const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'
const CACHE_TTL_SECONDS = 86400 // 24 h — TLEs are updated daily by CelesTrak

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

function parseTle(text: string): { name: string; line1: string; line2: string } | null {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
  if (lines.length < 3) return null
  const [name, line1, line2] = lines
  if (!name || !line1 || !line2) return null
  if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) return null
  return { name, line1, line2 }
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'nasa:iss-tle'

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

  const upstream = await fetch(CELESTRAK_URL)

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream CelesTrak error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const text = await upstream.text()
  const parsed = parseTle(text)

  if (!parsed) {
    return new Response(JSON.stringify({ error: 'Failed to parse TLE text' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const validated = IssTleSchema.safeParse(parsed)
  if (!validated.success) {
    return new Response(
      JSON.stringify({ error: 'TLE schema validation failed', details: validated.error.flatten() }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const body = JSON.stringify(validated.data)
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
