// One JPL request at a time (#100). A Durable Object is single-threaded but not
// serial: while one request awaits its fetch, the runtime delivers the next, so two
// visitors could still reach JPL together. This queue makes the order explicit with a
// promise chain, and spaces the starts so JPL never sees a burst.

export interface QueueOptions {
  /** Tasks waiting or running; past this, new ones are refused. */
  maxPending: number
  /** Least time between one task's start and the next one's. */
  minGapMs: number
  /** Rough seconds per task, for the Retry-After a refused caller gets. */
  taskSeconds?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** The queue is full; try again in about `retryAfterSeconds`. */
export class QueueFullError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('JPL queue is full')
    this.name = 'QueueFullError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const DEFAULT_TASK_SECONDS = 2

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export class SerialQueue {
  private tail: Promise<void> = Promise.resolve()
  private count = 0
  private lastStart = Number.NEGATIVE_INFINITY
  private readonly opts: QueueOptions
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(opts: QueueOptions) {
    this.opts = opts
    this.now = opts.now ?? Date.now
    this.sleep = opts.sleep ?? defaultSleep
  }

  /** Tasks waiting or running. */
  get pending(): number {
    return this.count
  }

  isFull(): boolean {
    return this.count >= this.opts.maxPending
  }

  /** About how long the tasks already queued will take. */
  retryAfterSeconds(): number {
    return Math.ceil(this.count * (this.opts.taskSeconds ?? DEFAULT_TASK_SECONDS))
  }

  /** Run `task` after every task queued before it has settled. */
  run<T>(task: () => Promise<T>): Promise<T> {
    if (this.isFull()) return Promise.reject(new QueueFullError(this.retryAfterSeconds()))
    this.count += 1
    const result = this.tail.then(async () => {
      const wait = this.lastStart + this.opts.minGapMs - this.now()
      if (wait > 0) await this.sleep(wait)
      this.lastStart = this.now()
      return task()
    })
    // The next task waits for this one to settle, whether it worked or not.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result.finally(() => {
      this.count -= 1
    })
  }
}
