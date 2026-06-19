import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

// Spaceflight News API — aggregated space headlines. Public, no key.
const SOURCE = 'https://api.spaceflightnewsapi.net/v4/articles/?limit=8&ordering=-published_at'
const CACHE_TTL_SECONDS = 900 // 15 min

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

const RawSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      news_site: z.string().optional(),
      published_at: z.string().optional(),
      url: z.string().optional(),
    }),
  ),
})

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'spacenews:latest:v1'

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

  const upstream = await fetch(SOURCE)
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream space news error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const parsed = RawSchema.safeParse(await upstream.json())
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid upstream response' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const articles = parsed.data.results.map((a) => ({
    title: a.title,
    site: a.news_site ?? '',
    publishedAt: a.published_at ?? '',
    url: a.url ?? '',
  }))

  const body = JSON.stringify({ articles, updatedAt: new Date().toISOString() })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
