import { upstreamError } from './_cache'

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

/**
 * Which part of the queue's daily allowance a request spends (#223). The Function names it,
 * so a visitor cannot pick: /api/trajectory asks for `trajectory`, whose share is capped
 * apart from `lookup`, so a script cannot spend what name lookups rely on.
 */
export type JplShare = 'lookup' | 'trajectory'

/** Ask JPL through the queue. JPL's own status comes back as `status`. */
export async function askJpl(
  ns: JplQueueNamespace,
  url: string,
  share: JplShare,
): Promise<JplReply> {
  let res: Response
  try {
    const stub = ns.get(ns.idFromName(QUEUE_NAME))
    res = await stub.fetch('https://jpl-queue/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, share }),
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
