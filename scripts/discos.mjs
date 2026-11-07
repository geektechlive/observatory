// ESA DISCOSweb for scripts/refresh-data.mjs (#101): mass, size, shape and operator for
// the orrery's spacecraft (by COSPAR id) and chosen satellites (by NORAD number), read
// with the owner's token and kept in KV for a week per object. Never on the request path.
//
// The token goes in the Authorization header and nowhere else: not in a URL, an error, a
// log line or the payload. A few requests a run, paced; a 429 stops the step until the
// next run.

import {
  CRAFT_COSPAR,
  DISCOS_CITATION,
  DISCOS_PAGE,
  discosObjectsUrl,
  discosStale,
  nameMatches,
  parseDiscosObjects,
} from '../src/lib/discos.ts'

/** Seconds apart, well inside DISCOSweb's per-minute limit. */
export const DEFAULT_PAUSE_MS = 3000
/** Requests a run: the craft, then pages of satellites. */
export const MAX_REQUESTS = 4
const FETCH_TIMEOUT_MS = 60_000

/** The token from the environment, or null. */
export function discosToken(env) {
  const t = (env.DISCOSWEB_TOKEN ?? '').trim()
  return t || null
}

const reasonOf = (err) => (err instanceof Error ? err.message : String(err))

/**
 * One DISCOSweb run. Returns the payload (craft by NAIF id, satellites by NORAD number,
 * each with when it was fetched), whether it changed, the request count and the rate
 * limit DISCOSweb reported.
 */
export async function buildDiscos({
  now,
  token,
  http = fetch,
  satnos,
  previous = null,
  pauseMs = DEFAULT_PAUSE_MS,
  maxRequests = MAX_REQUESTS,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const nowIso = new Date(now).toISOString()
  const craft = { ...previous?.craft }
  const wanted = new Set(satnos)
  const satellites = Object.fromEntries(
    Object.entries(previous?.satellites ?? {}).filter(([n]) => wanted.has(n)),
  )
  const missing = []
  let requests = 0
  let changed = Object.keys(previous?.satellites ?? {}).length !== Object.keys(satellites).length
  let rateLimit = null
  let stopped = false

  const ask = async (url) => {
    if (requests > 0) await sleep(pauseMs)
    requests += 1
    const res = await http(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'DiscosWeb-Api-Version': '2',
        Accept: 'application/vnd.api+json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    rateLimit = {
      limit: res.headers.get('X-RateLimit-Limit'),
      remaining: res.headers.get('X-RateLimit-Remaining'),
    }
    const body = await res.text()
    if (res.status === 429) {
      stopped = true
      throw new Error(`HTTP 429, retry after ${res.headers.get('Retry-After') ?? '?'} s`)
    }
    if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
    return parseDiscosObjects(JSON.parse(body))
  }

  const staleCraft = Object.entries(CRAFT_COSPAR).filter(([naif]) => discosStale(craft[naif]?.fetchedAt, now))
  if (staleCraft.length > 0 && requests < maxRequests) {
    try {
      const objects = await ask(discosObjectsUrl({ cospars: staleCraft.map(([, c]) => c.cospar) }))
      for (const [naif, c] of staleCraft) {
        const o = objects.find((x) => x.cosparId === c.cospar)
        if (!o) {
          missing.push({ id: `craft:${naif}`, reason: `${c.cospar} not in DISCOS` })
        } else if (!nameMatches(o.name, c.expect)) {
          missing.push({ id: `craft:${naif}`, reason: `${c.cospar} is "${o.name}"` })
          delete craft[naif]
        } else {
          craft[naif] = { ...o, fetchedAt: nowIso }
        }
      }
      changed = true
    } catch (err) {
      missing.push({ id: 'craft', reason: reasonOf(err) })
    }
  }

  const staleSats = satnos.filter((n) => discosStale(satellites[n]?.fetchedAt, now))
  for (let i = 0; i < staleSats.length && requests < maxRequests && !stopped; i += DISCOS_PAGE) {
    const page = staleSats.slice(i, i + DISCOS_PAGE)
    try {
      const objects = await ask(discosObjectsUrl({ satnos: page }))
      for (const o of objects) {
        if (o.satno && wanted.has(o.satno)) satellites[o.satno] = { ...o, fetchedAt: nowIso }
      }
      changed = true
    } catch (err) {
      missing.push({ id: `satellites:${page[0] ?? ''}`, reason: reasonOf(err) })
    }
  }

  return {
    payload: { generatedAt: nowIso, citation: DISCOS_CITATION, craft, satellites, missing },
    changed,
    requests,
    rateLimit,
  }
}
