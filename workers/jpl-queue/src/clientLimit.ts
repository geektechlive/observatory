/**
 * Uncached JPL asks per visitor (#236). The queue's daily budget is shared by everyone, and
 * the per-request rate limits never bound it: one address could spend the day's lookups in
 * about 35 minutes. Each visitor (a hash of its address, sent by the Pages Function) may ask
 * `limit` times per `windowMs`. In memory only, with no storage writes: an evicted Durable
 * Object forgets the counts, which only makes the cap more lenient for a while.
 */
export const CLIENT_HOURLY_LIMIT = 60
export const CLIENT_WINDOW_MS = 3_600_000
const PRUNE_EVERY_MS = 60_000

/** A client id is a SHA-256 hex digest (functions/api/_jpl.ts `clientId`). */
export const isClientId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

interface Entry {
  count: number
  windowStart: number
}

export class ClientLimit {
  private readonly entries = new Map<string, Entry>()
  /** When the map was last swept: at most once a minute, so a take stays O(1) (#236 review). */
  private lastPrune = Number.NEGATIVE_INFINITY
  private readonly limit: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor(
    limit = CLIENT_HOURLY_LIMIT,
    windowMs = CLIENT_WINDOW_MS,
    now: () => number = Date.now,
  ) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
  }

  /** Entries held now (tests check the map stays bounded). */
  get size(): number {
    return this.entries.size
  }

  /** Counts one ask; refuses past the limit with the seconds until the window resets. */
  take(client: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const t = this.now()
    this.prune(t)
    const entry = this.entries.get(client)
    if (!entry || t - entry.windowStart > this.windowMs) {
      this.entries.set(client, { count: 1, windowStart: t })
      return { ok: true }
    }
    if (entry.count >= this.limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.ceil((entry.windowStart + this.windowMs - t) / 1000),
      }
    }
    entry.count += 1
    return { ok: true }
  }

  private prune(t: number): void {
    if (t - this.lastPrune < PRUNE_EVERY_MS) return
    this.lastPrune = t
    for (const [key, e] of this.entries) {
      if (t - e.windowStart > this.windowMs) this.entries.delete(key)
    }
  }
}
