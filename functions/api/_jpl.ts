import { fetchUpstream, upstreamError } from './_cache'

// The way to JPL for on-demand requests (#100): every one goes through the jpl-queue
// Worker's Durable Object, which runs them one at a time (JPL Fair Use: "only one API
// request at a time"). The binding is declared in wrangler.toml once that Worker is
// deployed; until then these endpoints answer 503 and say lookup isn't set up.

/** What a Pages Function needs of the Durable Object namespace binding. */
export interface JplQueueNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): { fetch(url: string, init: RequestInit): Promise<Response> }
}

export interface JplEnv {
  JPL_QUEUE?: JplQueueNamespace
}

/** Marks a 503 that means "not deployed yet", which the health check only warns about. */
export const NOT_CONFIGURED_HEADER = 'X-Not-Configured'

/** The whole site shares one queue. */
const QUEUE_NAME = 'jpl'

export function notConfigured(): Response {
  const res = upstreamError(0, 'On-demand JPL lookup is not set up yet')
  res.headers.set(NOT_CONFIGURED_HEADER, 'jpl-queue')
  return res
}

export function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}

export type JplReply =
  { ok: true; status: number; text: string } | { ok: false; response: Response }

/** Ask JPL through the queue. JPL's own status comes back as `status`. */
export async function askJpl(ns: JplQueueNamespace, url: string): Promise<JplReply> {
  let res: Response
  try {
    const stub = ns.get(ns.idFromName(QUEUE_NAME))
    res = await stub.fetch('https://jpl-queue/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  } catch (err) {
    console.warn('[jpl] queue unreachable:', err)
    return { ok: false, response: upstreamError(0, 'JPL queue unreachable') }
  }
  if (res.status !== 200) {
    const why = res.headers.get('X-Queue') === null ? 'JPL unavailable' : 'JPL is busy'
    return {
      ok: false,
      response: upstreamError(Number(res.headers.get('X-Jpl-Status') ?? res.status), why),
    }
  }
  return { ok: true, status: Number(res.headers.get('X-Jpl-Status')), text: await res.text() }
}

/**
 * Ask JPL for a cached feed (#146: planets, Sentry, Fireball): through the queue when it is
 * bound, so these never overlap a lookup; without it, straight to JPL as before, so the
 * feed keeps working where the queue isn't deployed (local dev, a preview without it).
 * A network failure or timeout on the direct path throws, as `fetchUpstream` does.
 */
export async function askJplFeed(
  ns: JplQueueNamespace | undefined,
  url: string,
  direct?: { init?: RequestInit; timeoutMs?: number },
): Promise<JplReply> {
  if (ns) return askJpl(ns, url)
  const res = await fetchUpstream(
    url,
    direct?.init,
    direct?.timeoutMs === undefined ? undefined : { timeoutMs: direct.timeoutMs },
  )
  return { ok: true, status: res.status, text: await res.text() }
}
