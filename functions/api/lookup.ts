import type { PagesFunction } from '@cloudflare/workers-types'

import { parseLookupQuery, parseSbdbLookup, sbdbLookupUrl } from '../../src/lib/orrery/jplLookup'
import type { LookupResponse } from '../../src/schemas/jplLookup'
import { cachedJson, contractError, upstreamError } from './_cache'
import { askJpl, badRequest, type JplEnv, notConfigured } from './_jpl'

// GET /api/lookup?q= (#100): find any asteroid or comet in JPL's Small-Body Database,
// on demand, through the jpl-queue Durable Object. The normalised search string is the
// cache key, so repeat searches never reach JPL.

const LOOKUP_TTL_SECONDS = 86_400

export const onRequest: PagesFunction<JplEnv> = (ctx) => {
  const parsed = parseLookupQuery(new URL(ctx.request.url).searchParams.get('q'))
  if (!parsed.ok) return badRequest(parsed.reason)
  const ns = ctx.env.JPL_QUEUE
  if (!ns) return notConfigured()
  const { q } = parsed

  return cachedJson(ctx, `jpl:lookup:v1:${q}`, LOOKUP_TTL_SECONDS, async () => {
    const reply = await askJpl(ns, sbdbLookupUrl(q))
    if (!reply.ok) return reply.response
    // 300 is SBDB's "matched more than one object", with the list.
    if (reply.status !== 200 && reply.status !== 300) {
      return upstreamError(reply.status, 'JPL SBDB unavailable')
    }
    const result = parseSbdbLookup(JSON.parse(reply.text))
    if (!result) return contractError('Unexpected answer from JPL SBDB')
    const body: LookupResponse = { query: q, provider: 'jpl-sbdb', result }
    return { body: JSON.stringify(body) }
  })
}
