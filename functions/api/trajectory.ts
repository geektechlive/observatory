import type { PagesFunction } from '@cloudflare/workers-types'

import { parseEphemerisLimit, parseHorizonsVectors } from '../../src/lib/horizons'
import {
  horizonsTrajectoryUrl,
  lookupCommand,
  type LookupObject,
  lookupTargetMatches,
  parseSbdbLookup,
  parseTrajectoryParams,
  sbdbSpkUrl,
  type TrajectoryRequest,
  trajectorySampleCount,
} from '../../src/lib/orrery/jplLookup'
import { readLookupResult, type TrajectoryResponse } from '../../src/schemas/jplLookup'
import { cachedJson, contractError, upstreamError } from './_cache'
import { askJpl, badRequest, type JplEnv, type JplQueueNamespace, notConfigured } from './_jpl'

// GET /api/trajectory?id=sb:<SPK-ID>&start=&end=&step= (#100): Horizons vectors for any
// small body over a span, on demand, through the jpl-queue Durable Object. The object is
// looked up in SBDB first (cached for a week) to name it the way Horizons needs and to
// check Horizons answered for it. Spans are capped at 600 samples; steps go down to 10
// minutes, for a close pass's dense span (#215).

const OBJECT_TTL_SECONDS = 7 * 86_400
const TRAJECTORY_TTL_SECONDS = 86_400

type Ctx = Parameters<PagesFunction<JplEnv>>[0]

/** SBDB's answer for one SPK-ID, cached apart so every span of an object shares it. */
function objectAnswer(ctx: Ctx, ns: JplQueueNamespace, spkid: string): Promise<Response> {
  return cachedJson(
    ctx,
    `jpl:sbdb-spk:v1:${spkid}`,
    OBJECT_TTL_SECONDS,
    async () => {
      const reply = await askJpl(ns, sbdbSpkUrl(spkid))
      if (!reply.ok) return reply.response
      if (reply.status !== 200) return upstreamError(reply.status, 'JPL SBDB unavailable')
      const result = parseSbdbLookup(JSON.parse(reply.text))
      if (!result) return contractError('Unexpected answer from JPL SBDB')
      return { body: JSON.stringify(result) }
    },
    { staleIfError: false },
  )
}

const notFound = () =>
  new Response(JSON.stringify({ error: 'No such object in JPL SBDB' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })

function trajectoryBody(
  object: LookupObject,
  req: TrajectoryRequest,
  target: string | null,
  rest: Pick<TrajectoryResponse, 'fine' | 'availableFrom' | 'availableTo'>,
): string {
  const body: TrajectoryResponse = {
    generatedAt: new Date().toISOString(),
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    object,
    target,
    request: { start: req.start, end: req.end, stepMinutes: req.stepMinutes },
    ...rest,
  }
  return JSON.stringify(body)
}

async function produceTrajectory(
  ns: JplQueueNamespace,
  object: LookupObject,
  req: TrajectoryRequest,
) {
  const reply = await askJpl(ns, horizonsTrajectoryUrl(lookupCommand(object), req))
  if (!reply.ok) return reply.response
  if (reply.status !== 200) return upstreamError(reply.status, 'JPL Horizons unavailable')
  const raw: unknown = JSON.parse(reply.text)
  const result =
    typeof raw === 'object' && raw !== null && 'result' in raw && typeof raw.result === 'string'
      ? raw.result
      : null
  if (result === null) return contractError('Horizons answered without a result')

  const vectors = parseHorizonsVectors(result)
  if (!vectors || vectors.samples.length === 0) {
    const limit = parseEphemerisLimit(result)
    if (!limit) return contractError('Horizons answered without vectors')
    return {
      body: trajectoryBody(object, req, vectors?.target ?? null, {
        fine: null,
        availableFrom: limit.side === 'prior' ? limit.iso : null,
        availableTo: limit.side === 'after' ? limit.iso : null,
      }),
    }
  }
  // Horizons answering for another object is the `DES=433` lesson (#92).
  if (!lookupTargetMatches(object, vectors.target)) {
    return contractError('Horizons answered for a different object')
  }
  if (vectors.samples.length !== trajectorySampleCount(req)) {
    return contractError('Horizons answered with the wrong number of samples')
  }
  const first = vectors.samples[0]
  return {
    body: trajectoryBody(object, req, vectors.target, {
      fine: {
        start: first?.jd ?? 0,
        step: req.stepMinutes / 1440,
        samples: vectors.samples.flatMap((s) => [s.x, s.y, s.z, s.vx, s.vy, s.vz]),
      },
      availableFrom: null,
      availableTo: null,
    }),
  }
}

export const onRequest: PagesFunction<JplEnv> = async (ctx) => {
  const parsed = parseTrajectoryParams(new URL(ctx.request.url).searchParams)
  if (!parsed.ok) return badRequest(parsed.reason)
  const ns = ctx.env.JPL_QUEUE
  if (!ns) return notConfigured()
  const req = parsed.value

  const answer = await objectAnswer(ctx, ns, req.spkid)
  if (!answer.ok) return answer
  const lookup = readLookupResult(await answer.json())
  if (!lookup) return contractError('Unexpected cached SBDB answer')
  if (lookup.type !== 'object') return notFound()
  const object = lookup.object

  const key = `jpl:traj:v1:${req.spkid}:${req.start}:${req.end}:${String(req.stepMinutes)}`
  return cachedJson(ctx, key, TRAJECTORY_TTL_SECONDS, () => produceTrajectory(ns, object, req))
}
