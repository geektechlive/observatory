import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { cachedJson, fetchUpstream, upstreamError } from './_cache'

// Spaceflight News API — aggregated space headlines. Public, no key.
const SOURCE = 'https://api.spaceflightnewsapi.net/v4/articles/?limit=8&ordering=-published_at'
const CACHE_TTL_SECONDS = 900 // 15 min

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

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'spacenews:latest:v1', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetchUpstream(SOURCE)
    if (!upstream.ok) return upstreamError(upstream.status, 'Spaceflight News upstream error')

    const parsed = RawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      console.warn('[space-news] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid Spaceflight News response')
    }

    const articles = parsed.data.results.map((a) => ({
      title: a.title,
      site: a.news_site ?? '',
      publishedAt: a.published_at ?? '',
      url: a.url ?? '',
    }))

    return { body: JSON.stringify({ articles, updatedAt: new Date().toISOString() }) }
  })
