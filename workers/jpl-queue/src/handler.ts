import type { DailyBudget } from './budget'
import { isJplUrl, type JplAnswer, JplFetchError } from './jplFetch'
import { QueueFullError, type SerialQueue } from './queue'

// What the Durable Object does with one request (#100): POST {"url": <JPL URL>} and get
// JPL's body back, with JPL's own status in X-Jpl-Status. The DO answers 200 for any
// answer JPL gave, so the Pages Function decides what JPL's status means; 503 is only
// for the queue's own refusals and an unreachable JPL.

export interface QueueDeps {
  queue: SerialQueue
  budget: DailyBudget
  fetchJpl: (url: string) => Promise<JplAnswer>
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

async function readUrl(req: Request): Promise<string | null> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || !('url' in body)) return null
  const url = body.url
  return typeof url === 'string' && isJplUrl(url) ? url : null
}

export async function handleQueueRequest(req: Request, deps: QueueDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  const url = await readUrl(req)
  if (!url) return json(400, { error: 'Body must be {"url": <a JPL API URL>}' })

  // A full queue refuses before spending budget, so refusals cost JPL nothing.
  if (deps.queue.isFull()) return queueFull(deps.queue.retryAfterSeconds())
  const budget = await deps.budget.take()
  if (!budget.ok) {
    return json(
      503,
      { error: "Today's JPL budget is spent" },
      { 'Retry-After': String(budget.retryAfterSeconds), 'X-Queue': 'budget' },
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
