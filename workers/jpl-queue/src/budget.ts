// A daily cap on JPL requests (#100), so no burst of visitors can lean on JPL for long.
// The count lives in the Durable Object's storage, one key per UTC day: one row write
// per request, against the free plan's 100,000 a day.
//
// The day is split into two shares (#223, ADR 0010 addendum), each its own DailyBudget with
// its own key: name lookups, and trajectories. The shares add up to the whole day, and a
// share can only ever spend its own part, so a script that fills the trajectory share
// leaves every lookup the allowance they had.

/** JPL requests a UTC day may make through this queue, all shares together. */
export const TOTAL_DAILY_LIMIT = 2000
/** Trajectory requests (Horizons spans, and the SBDB read /api/trajectory makes first). */
export const TRAJECTORY_DAILY_LIMIT = 600
/** Name lookups: what is left of the day once trajectories have their share. */
export const LOOKUP_DAILY_LIMIT = TOTAL_DAILY_LIMIT - TRAJECTORY_DAILY_LIMIT

/** Which share a request spends from. The Pages Function decides; a client never can. */
export type JplShare = 'lookup' | 'trajectory'
export const isJplShare = (value: unknown): value is JplShare =>
  value === 'lookup' || value === 'trajectory'

export interface BudgetStore {
  get(key: string): Promise<number | undefined>
  put(key: string, value: number): Promise<void>
  delete(key: string): Promise<unknown>
}

export type BudgetDecision = { ok: true } | { ok: false; retryAfterSeconds: number }

const DAY_MS = 86_400_000

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export class DailyBudget {
  private day: string | null = null
  private used = 0
  private readonly store: BudgetStore
  private readonly limit: number
  private readonly now: () => number
  private readonly prefix: string

  /** `prefix` names the share's storage rows: `<prefix>:<UTC day>`. */
  constructor(store: BudgetStore, limit: number, now: () => number = Date.now, prefix = 'budget') {
    this.store = store
    this.limit = limit
    this.now = now
    this.prefix = prefix
  }

  /** Spend one request from today's budget, or say how long until tomorrow's. */
  async take(): Promise<BudgetDecision> {
    const now = this.now()
    const key = `${this.prefix}:${dayOf(now)}`
    if (key !== this.day) {
      if (this.day) await this.store.delete(this.day)
      this.used = (await this.store.get(key)) ?? 0
      this.day = key
    }
    if (this.used >= this.limit) {
      const midnight = Math.floor(now / DAY_MS + 1) * DAY_MS
      return { ok: false, retryAfterSeconds: Math.ceil((midnight - now) / 1000) }
    }
    this.used += 1
    await this.store.put(key, this.used)
    return { ok: true }
  }
}
