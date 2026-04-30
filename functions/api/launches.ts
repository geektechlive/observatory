import type { PagesFunction } from '@cloudflare/workers-types'
import { LaunchesResponseSchema } from '../../src/schemas/launches'

const CACHE_TTL_SECONDS = 1800 // 30 min
const BACKUP_TTL_SECONDS = 7 * 24 * 3600 // 7-day stale backup for rate-limit fallback
const LL2_URL = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=5&ordering=net'

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const kvKey = 'll2:launches:upcoming:v1'
  const backupKey = 'll2:launches:upcoming:v1:backup'
  const fresh = new URL(request.url).searchParams.get('fresh') === '1'

  if (!fresh) {
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
  }

  let upstream: Response
  try {
    upstream = await fetch(LL2_URL, { headers: { Accept: 'application/json' } })
  } catch {
    const stale: string | null = await env.OBSERVATORY_CACHE.get(backupKey)
    if (stale !== null) {
      return new Response(stale, {
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'STALE' },
      })
    }
    return new Response(JSON.stringify({ error: 'Launch Library upstream unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (upstream.status === 429 || !upstream.ok) {
    const stale: string | null = await env.OBSERVATORY_CACHE.get(backupKey)
    if (stale !== null) {
      return new Response(stale, {
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'STALE' },
      })
    }
    return new Response(JSON.stringify({ error: `Launch Library error: ${upstream.status}` }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw: unknown = await upstream.json()
  const parsed = LaunchesResponseSchema.safeParse(raw)

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const body = JSON.stringify(parsed.data)
  await Promise.all([
    env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS }),
    env.OBSERVATORY_CACHE.put(backupKey, body, { expirationTtl: BACKUP_TTL_SECONDS }),
  ])

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
