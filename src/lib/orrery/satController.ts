/**
 * The orrery's satellite layer, minus the drawing (#98): which CelesTrak groups to fetch,
 * loading them into the worker, when to ask it for a pass, and which frame is current.
 * The renderer ticks it on every drawn frame and draws what `frame()` holds
 * (three/satLayer.ts); `onChange` asks the renderer for another frame. Passes are asked
 * from the tick, and also when a new field arrives with no frame for it (#206), at the
 * last tick's date, since a detached orrery does not tick.
 *
 * A group is fetched only when it is switched on and the Earth frame is open, so a
 * visitor who never comes near Earth downloads nothing. Positions come from the worker,
 * never computed here: the main thread only swaps buffers.
 */
import type { SatFrame } from '@/lib/orbit/bulk/satField'
import type { SatFieldInfo } from '@/lib/orbit/bulk/satHandler'
import type { SatWorker } from '@/lib/orbit/bulk/satsClient'
import { SAT_FAILED, SAT_OK, SAT_OUT_OF_WINDOW } from '@/lib/orbit/bulk/satStatus'
import { SAT_GROUPS, type SatGroupId } from '@/lib/orbit/satCatalog'

export interface SatSource {
  fetchGroup: (
    group: SatGroupId,
  ) => Promise<{ body: ArrayBuffer; degraded: boolean; dataAgeSeconds: number | null }>
  worker: () => Promise<SatWorker>
}

export type SatGroupStatus = 'off' | 'waiting' | 'loading' | 'loaded' | 'error'

export interface SatGroupState {
  status: SatGroupStatus
  /** Objects loaded. */
  count: number
  /** The stored copy is older than usual. */
  degraded: boolean
  /** How old the stored copy is, s. */
  ageSeconds: number | null
}

export interface SatSnapshot {
  groups: Partial<Record<SatGroupId, SatGroupState>>
  /** Objects loaded, drawn this frame, hidden past their epoch window, and SGP4 failures. */
  total: number
  drawn: number
  outOfWindow: number
  failed: number
  /** The last worker pass, ms, and which SGP4 ran it. */
  passMs: number | null
  engine: 'js' | null
}

export interface SatTick {
  /** The Earth frame is open, at least a little. */
  near: boolean
  /** How often to pass (satView's satDisplay); null: hold the last pass. */
  cadenceMs: number | null
  simMs: number
  wallMs: number
}

/** In the haze the last pass stays, unless the clock has moved this far from it… */
const HAZE_REFRESH_SIM_MS = 6 * 3_600_000
/** …and then no more often than this. */
const HAZE_REFRESH_WALL_MS = 5000

const idle = (): SatGroupState => ({ status: 'off', count: 0, degraded: false, ageSeconds: null })

export class SatController {
  private enabled: ReadonlySet<SatGroupId> = new Set()
  private readonly groups = new Map<SatGroupId, SatGroupState>()
  /** Groups the worker holds now (or is loading). */
  private readonly inWorker = new Set<SatGroupId>()
  private worker: Promise<SatWorker> | null = null
  /** The worker once started: passes are asked synchronously, from tick. */
  private ready: SatWorker | null = null
  private info: SatFieldInfo | null = null
  private current: (SatFrame & { version: number }) | null = null
  private inFlight = false
  /** The last tick: a field that changes after it is passed at its date (#206). */
  private lastTick: SatTick | null = null
  private lastPassWall = Number.NEGATIVE_INFINITY
  private lastPassSim = Number.NaN
  private passMs: number | null = null
  private engine: 'js' | null = null
  private counts = { drawn: 0, outOfWindow: 0, failed: 0 }
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  private readonly source: SatSource
  private readonly onChange: () => void

  constructor(source: SatSource, onChange: () => void) {
    this.source = source
    this.onChange = onChange
    for (const g of SAT_GROUPS) this.groups.set(g.id, idle())
  }

  setEnabled(groups: ReadonlySet<SatGroupId>): void {
    this.enabled = groups
    for (const g of SAT_GROUPS) {
      const state = this.groups.get(g.id) ?? idle()
      if (!groups.has(g.id) && state.status !== 'off') this.groups.set(g.id, idle())
      if (groups.has(g.id) && state.status === 'off') this.set(g.id, { status: 'waiting' })
    }
    this.onChange()
  }

  /** Once per drawn frame. */
  tick(t: SatTick): void {
    if (this.disposed) return
    this.lastTick = t
    this.syncGroups(t.near)
    this.maybePass(t)
  }

  /** The current frame's buffers (TEME km and a status byte per object), or null. */
  frame(): SatFrame | null {
    return this.current && this.info && this.current.version === this.info.version
      ? this.current
      : null
  }

  field(): SatFieldInfo | null {
    return this.info
  }

  /** A pass is on its way from the worker (#206: "pending" means one will land). */
  passing(): boolean {
    return this.inFlight
  }

  snapshot(): SatSnapshot {
    return {
      groups: Object.fromEntries(this.groups),
      total: this.info?.ids.length ?? 0,
      ...this.counts,
      passMs: this.passMs,
      engine: this.engine,
    }
  }

  /** Read through a call: TypeScript would otherwise keep its narrowing across an await. */
  private alive(): boolean {
    return !this.disposed
  }

  dispose(): void {
    this.disposed = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private set(group: SatGroupId, patch: Partial<SatGroupState>): void {
    this.groups.set(group, { ...(this.groups.get(group) ?? idle()), ...patch })
  }

  /**
   * A worker that crashed (#191) holds nothing any more: forget it and what it held, show
   * its groups as failed, and let the next load (a toggle off and on) start a new one.
   */
  private dropDeadWorker(): void {
    if (!this.ready?.failed) return
    this.worker = null
    this.ready = null
    this.info = null
    this.current = null
    this.inFlight = false
    for (const group of this.inWorker) {
      if (this.enabled.has(group)) this.set(group, { status: 'error' })
    }
    this.inWorker.clear()
  }

  private getWorker(): Promise<SatWorker> {
    this.dropDeadWorker()
    this.worker ??= this.source.worker().then((w) => {
      this.ready = w
      return w
    })
    return this.worker
  }

  /** Fetch and load what is switched on (only while near); unload what was switched off. */
  private syncGroups(near: boolean): void {
    for (const group of [...this.inWorker]) {
      if (this.enabled.has(group)) continue
      this.inWorker.delete(group)
      void this.getWorker()
        .then((w) => w.unload(group))
        .then((reply) => {
          this.setField(reply.field)
        })
        .catch(() => undefined)
    }
    if (!near) return
    for (const group of this.enabled) {
      if (this.inWorker.has(group) || this.groups.get(group)?.status === 'error') continue
      this.inWorker.add(group)
      this.set(group, { status: 'loading' })
      void this.load(group)
    }
  }

  private async load(group: SatGroupId): Promise<void> {
    try {
      const [fetched, worker] = await Promise.all([this.source.fetchGroup(group), this.getWorker()])
      if (!this.alive() || !this.inWorker.has(group)) return
      const reply = await worker.load(fetched.body)
      if (!this.alive()) return
      if (!this.inWorker.has(group)) {
        // Switched off while it loaded.
        this.setField((await worker.unload(group)).field)
        return
      }
      this.set(group, {
        status: 'loaded',
        count: reply.count,
        degraded: fetched.degraded,
        ageSeconds: fetched.dataAgeSeconds,
      })
      this.setField(reply.field)
    } catch {
      this.dropDeadWorker()
      this.inWorker.delete(group)
      if (this.enabled.has(group)) this.set(group, { status: 'error' })
      this.onChange()
    }
  }

  private setField(field: SatFieldInfo): void {
    // Replies can arrive out of order across fetches; keep the newest field.
    if (this.info && field.version < this.info.version) return
    this.info = field
    this.passForField()
    this.onChange()
  }

  /**
   * A new field leaves no current frame until the worker passes it. Ask now, at the last
   * tick's date, rather than wait for the next tick: while Look closer is open the orrery
   * is detached and does not tick, and every position would stay null (#206).
   */
  private passForField(): void {
    const t = this.lastTick
    if (this.disposed || !t || this.frame() !== null) return
    this.maybePass(t)
  }

  private due(t: SatTick): number | 'now' | null {
    const fresh = this.frame() !== null
    if (!fresh) return 'now'
    if (t.cadenceMs === null) {
      const far = !(Math.abs(t.simMs - this.lastPassSim) <= HAZE_REFRESH_SIM_MS)
      return far && t.wallMs - this.lastPassWall >= HAZE_REFRESH_WALL_MS ? 'now' : null
    }
    if (t.simMs === this.lastPassSim) return null
    const wait = this.lastPassWall + t.cadenceMs - t.wallMs
    return wait <= 0 ? 'now' : wait
  }

  private maybePass(t: SatTick): void {
    const worker = this.ready
    if (!worker || this.inFlight || !this.info || this.info.ids.length === 0 || !t.near) return
    const due = this.due(t)
    if (due === null) return
    if (due !== 'now') {
      this.timer ??= setTimeout(() => {
        this.timer = null
        this.onChange()
      }, due)
      return
    }
    this.inFlight = true
    this.lastPassWall = t.wallMs
    this.lastPassSim = t.simMs
    worker
      .propagate(new Date(t.simMs))
      .then((reply) => {
        this.inFlight = false
        if (this.disposed) return
        const frame = { positions: reply.positions, status: reply.status, version: reply.version }
        if (!this.info || reply.version !== this.info.version) {
          worker.release(frame)
          this.passForField()
          this.onChange()
          return
        }
        if (this.current) worker.release(this.current)
        this.current = frame
        this.passMs = reply.ms
        this.engine = reply.engine
        this.count(frame.status)
        this.onChange()
      })
      .catch(() => {
        this.inFlight = false
        this.dropDeadWorker()
        this.onChange()
      })
  }

  private count(status: Uint8Array): void {
    let drawn = 0
    let outOfWindow = 0
    let failed = 0
    for (const s of status) {
      if (s === SAT_OK) drawn += 1
      else if (s === SAT_OUT_OF_WINDOW) outOfWindow += 1
      else if (s === SAT_FAILED) failed += 1
    }
    this.counts = { drawn, outOfWindow, failed }
  }
}
