import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { parseHorizons } from '../../src/lib/horizons'
import { cachedJson, upstreamError } from './_cache'
import { askJplFeed, type JplEnv, type JplQueueNamespace, type JplReply } from './_jpl'

// JPL Horizons wraps its fixed-width ephemeris table in a JSON `result` string.
const HorizonsRawSchema = z.object({ result: z.string().optional() })

// JPL Horizons geocentric ephemerides for the planets, Moon and Sun. Public, no key.
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const CACHE_TTL_SECONDS = 3600 // 1h
// Horizons answers 503 to overlapping requests from one address (#88), so the bodies
// are asked one at a time (~140 ms each). Past the total budget, the rest are skipped
// and the answer goes out degraded.
// - Through the jpl-queue (#146), which starts one JPL request a second, nine bodies take
//   about 9 s, more when a lookup or Sentry is queued between them. 20 s leaves room and
//   stays inside the 30 s a REVALIDATING refresh gets in waitUntil.
// - Directly (no binding), a body gets 4 s and all of them 10 s, as before.
const QUEUED_BUDGET_MS = 20_000
const BODY_TIMEOUT_MS = 4000
const DIRECT_BUDGET_MS = 10_000

const BODIES: { name: string; id: string }[] = [
  { name: 'Sun', id: '10' },
  { name: 'Moon', id: '301' },
  { name: 'Mercury', id: '199' },
  { name: 'Venus', id: '299' },
  { name: 'Mars', id: '499' },
  { name: 'Jupiter', id: '599' },
  { name: 'Saturn', id: '699' },
  { name: 'Uranus', id: '799' },
  { name: 'Neptune', id: '899' },
]

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** Whichever settles first: the reply, or null once `ms` have passed. */
function withDeadline(reply: Promise<JplReply>, ms: number): Promise<JplReply | null> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      resolve(null)
    }, ms)
  })
  return Promise.race([reply, deadline]).finally(() => {
    if (timer !== null) clearTimeout(timer)
  })
}

const DIRECT_INIT: RequestInit = {
  headers: { Accept: 'application/json', 'User-Agent': 'observatory.geektechlive.com' },
}

/** One body's request: through the queue (bounded by what's left of the budget) or direct. */
function askBody(
  ns: JplQueueNamespace | undefined,
  url: string,
  msLeft: number,
): Promise<JplReply | null> {
  if (ns) return withDeadline(askJplFeed(ns, url), msLeft)
  return askJplFeed(undefined, url, { init: DIRECT_INIT, timeoutMs: BODY_TIMEOUT_MS })
}

async function fetchBody(
  ns: JplQueueNamespace | undefined,
  msLeft: number,
  name: string,
  id: string,
  start: string,
  stop: string,
): Promise<{
  name: string
  raHours: number
  decDeg: number
  mag: number | null
  elongation: number
} | null> {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: id,
    EPHEM_TYPE: 'OBSERVER',
    CENTER: '500@399',
    START_TIME: start,
    STOP_TIME: stop,
    STEP_SIZE: '1d',
    QUANTITIES: "'1,9,23'",
  })
  try {
    const reply = await askBody(ns, `${HORIZONS}?${params.toString()}`, msLeft)
    if (!reply?.ok || reply.status !== 200) return null
    const parsedJson = HorizonsRawSchema.safeParse(JSON.parse(reply.text))
    if (!parsedJson.success || !parsedJson.data.result) return null
    const obs = parseHorizons(parsedJson.data.result)
    if (!obs) return null
    return {
      name,
      raHours: obs.raHours,
      decDeg: obs.decDeg,
      mag: Number.isFinite(obs.mag) ? obs.mag : null,
      elongation: obs.elongation,
    }
  } catch {
    return null
  }
}

export const onRequest: PagesFunction<JplEnv> = (ctx) => {
  const start = ymd(new Date())
  const ns = ctx.env.JPL_QUEUE
  const budgetMs = ns ? QUEUED_BUDGET_MS : DIRECT_BUDGET_MS
  return cachedJson(ctx, `horizons:planets:v2:${start}`, CACHE_TTL_SECONDS, async () => {
    const stop = ymd(new Date(Date.now() + 86_400_000))
    const started = Date.now()
    const bodies: NonNullable<Awaited<ReturnType<typeof fetchBody>>>[] = []
    // Strictly one body at a time: in parallel, nine would overlap at Horizons (direct)
    // or overflow the queue's eight places (queued).
    for (const b of BODIES) {
      const msLeft = budgetMs - (Date.now() - started)
      if (msLeft <= 0) break
      const body = await fetchBody(ns, msLeft, b.name, b.id, start, stop)
      if (body) bodies.push(body)
    }
    const degraded = bodies.length < BODIES.length

    if (bodies.length === 0) return upstreamError(0, 'JPL Horizons unavailable')
    if (degraded) {
      console.warn(
        `[planets] ${String(BODIES.length - bodies.length)} of 9 bodies missing; answering degraded`,
      )
    }

    return {
      body: JSON.stringify({ bodies, updatedAt: new Date().toISOString() }),
      // A degraded answer says why and who served it (#71), or its outages page at once.
      ...(degraded
        ? { extraHeaders: { 'X-Error-Kind': 'upstream', 'X-Data-Source': 'horizons' } }
        : {}),
      degraded,
    }
  })
}
