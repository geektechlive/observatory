import { type DailyBudget, isJplShare, type JplShare } from './budget'
import { type ClientLimit, isClientId } from './clientLimit'
import { isJplUrl, type JplAnswer, JplFetchError } from './jplFetch'
import { QueueFullError, type SerialQueue } from './queue'

// What the Durable Object does with one request (#100): POST {"url": <JPL URL>} and get
// JPL's body back, with JPL's own status in X-Jpl-Status. The DO answers 200 for any
// answer JPL gave, so the Pages Function decides what JPL's status means; 503 is only
// for the queue's own refusals and an unreachable JPL.

export interface QueueDeps {
  queue: SerialQueue
  /** One budget per share (#223); the sum of their limits is the day's whole allowance. */
  budgets: Record<JplShare, DailyBudget>
  fetchJpl: (url: string) => Promise<JplAnswer>
  /** Uncached asks per visitor (#236); absent in tests that don't exercise it. */
  clients?: ClientLimit
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

const queueFull = (retryAfterSeconds: number) =>
  json(
    503,
    { error: 'JPL queue is full' },
    { 'Retry-After': String(retryAfterSeconds), 'X-Queue': 'full' },
  )

interface Ask {
  url: string
  share: JplShare
  /** A hash of the visitor's address (#236), or null from a Function deployed before it. */
  client: string | null
}

/**
 * {"url": <JPL URL>, "share"?: "lookup" | "trajectory"}. Only a Pages Function reaches this
 * through the binding, and it names the share; no share means a lookup, which is what the
 * Functions deployed before #223 send. An unknown share is a bad request, never a free pass.
 */
async function readAsk(req: Request): Promise<Ask | null> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || !('url' in body)) return null
  const url = body.url
  if (typeof url !== 'string' || !isJplUrl(url)) return null
  const share = 'share' in body ? body.share : 'lookup'
  const client = 'client' in body ? body.client : null
  if (client !== null && !isClientId(client)) return null
  return isJplShare(share) ? { url, share, client } : null
}

export async function handleQueueRequest(req: Request, deps: QueueDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  const ask = await readAsk(req)
  if (!ask) {
    return json(400, {
      error:
        'Body must be {"url": <a JPL API URL>, "share"?: "lookup" | "trajectory", "client"?: <sha-256 hex>}',
    })
  }
  const { url, share, client } = ask

  // A full queue refuses before spending budget, so refusals cost JPL nothing.
  if (deps.queue.isFull()) return queueFull(deps.queue.retryAfterSeconds())
  // So does a visitor past its hourly cap (#236).
  if (client !== null && deps.clients) {
    const mine = deps.clients.take(client)
    if (!mine.ok) {
      return json(
        503,
        { error: 'Too many JPL asks from this visitor this hour' },
        { 'Retry-After': String(mine.retryAfterSeconds), 'X-Queue': 'client' },
      )
    }
  }
  const budget = await deps.budgets[share].take()
  if (!budget.ok) {
    return json(
      503,
      { error: "Today's JPL budget is spent" },
      {
        'Retry-After': String(budget.retryAfterSeconds),
        'X-Queue': 'budget',
        'X-Queue-Share': share,
      },
    )
  }

  try {
    const answer = await deps.queue.run(() => deps.fetchJpl(url))
    return new Response(answer.body, {
      status: 200,
      headers: {
        'Content-Type': answer.contentType ?? 'application/json',
        'X-Jpl-Status': String(answer.status),
        'X-Jpl-Attempts': String(answer.attempts),
      },
    })
  } catch (err) {
    if (err instanceof QueueFullError) return queueFull(err.retryAfterSeconds)
    if (err instanceof JplFetchError) {
      return json(503, { error: 'JPL unreachable' }, { 'X-Jpl-Status': '0' })
    }
    throw err
  }
}
