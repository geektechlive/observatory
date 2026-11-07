// A daily cap on JPL requests (#100), so no burst of visitors can lean on JPL for long.
// The count lives in the Durable Object's storage, one key per UTC day: one row write
// per request, against the free plan's 100,000 a day.

export interface BudgetStore {
  get(key: string): Promise<number | undefined>
  put(key: string, value: number): Promise<void>
  delete(key: string): Promise<unknown>
}

export type BudgetDecision = { ok: true } | { ok: false; retryAfterSeconds: number }

const DAY_MS = 86_400_000

const dayKey = (ms: number) => `budget:${new Date(ms).toISOString().slice(0, 10)}`

export class DailyBudget {
  private day: string | null = null
  private used = 0
  private readonly store: BudgetStore
  private readonly limit: number
  private readonly now: () => number

  constructor(store: BudgetStore, limit: number, now: () => number = Date.now) {
    this.store = store
    this.limit = limit
    this.now = now
  }

  /** Spend one request from today's budget, or say how long until tomorrow's. */
  async take(): Promise<BudgetDecision> {
    const now = this.now()
    const key = dayKey(now)
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
