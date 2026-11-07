import { DurableObject } from 'cloudflare:workers'

import { DailyBudget } from './budget'
import { handleQueueRequest, type QueueDeps } from './handler'
import { fetchJpl } from './jplFetch'
import { SerialQueue } from './queue'

// The jpl-queue Worker (#100). It exists only to host JplQueue, the Durable Object every
// on-demand JPL request goes through, one at a time, as JPL's Fair Use asks. Pages
// Functions reach it through a binding; it has no route and no workers.dev address.
//
// One instance (idFromName('jpl')) serves the whole site. It is billed for wall time
// while awake, at 128 MB: even awake all day that is 86,400 s x 0.128 GB = 11,059 GB-s,
// under the free plan's 13,000 GB-s a day.

/** Requests waiting or running; past this, visitors get 503 and Retry-After. */
const MAX_PENDING = 8
/** At least this long between one JPL request's start and the next. */
const MIN_GAP_MS = 1000
/** JPL requests a UTC day may make through this queue. */
const DAILY_LIMIT = 2000

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export class JplQueue extends DurableObject {
  private readonly deps: QueueDeps

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as Cloudflare.Env)
    const storage = ctx.storage
    this.deps = {
      queue: new SerialQueue({ maxPending: MAX_PENDING, minGapMs: MIN_GAP_MS }),
      budget: new DailyBudget(
        {
          get: (key) => storage.get<number>(key),
          put: (key, value) => storage.put(key, value),
          delete: (key) => storage.delete(key),
        },
        DAILY_LIMIT,
      ),
      fetchJpl: (url) => fetchJpl(url, { fetch: (u, init) => fetch(u, init), sleep }),
    }
  }

  override fetch(request: Request): Promise<Response> {
    return handleQueueRequest(request, this.deps)
  }
}

export default {
  fetch: () => new Response('Not found', { status: 404 }),
} satisfies ExportedHandler
