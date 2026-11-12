import { DurableObject } from 'cloudflare:workers'

import { DailyBudget, LOOKUP_DAILY_LIMIT, TRAJECTORY_DAILY_LIMIT } from './budget'
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

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export class JplQueue extends DurableObject {
  private readonly deps: QueueDeps

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as Cloudflare.Env)
    const storage = ctx.storage
    const store = {
      get: (key: string) => storage.get<number>(key),
      put: (key: string, value: number) => storage.put(key, value),
      delete: (key: string) => storage.delete(key),
    }
    this.deps = {
      queue: new SerialQueue({ maxPending: MAX_PENDING, minGapMs: MIN_GAP_MS }),
      // Two shares of the day's 2,000 (#223), each its own row per UTC day.
      budgets: {
        lookup: new DailyBudget(store, LOOKUP_DAILY_LIMIT),
        trajectory: new DailyBudget(store, TRAJECTORY_DAILY_LIMIT, Date.now, 'budget:trajectory'),
      },
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
