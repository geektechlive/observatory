/**
 * The satellite worker's message handling (#98), kept apart from the worker shim
 * (sats.worker.ts) so it runs in tests. Holds the loaded groups; answers each frame
 * request with one SGP4 pass over all of them.
 */
import type { SatGroupId, SatRow } from '../satCatalog'
import type { bulkRuntime } from './bulkEci'
import {
  buildSatField,
  decodeSatGroup,
  propagateField,
  propagateFieldJs,
  type SatField,
  type SatFrame,
} from './satField'

type Runtime = Awaited<ReturnType<typeof bulkRuntime>>

export type SatRequest =
  /** The /api/orrery-sats body as fetched, transferred undecoded. */
  | { type: 'load'; id: number; body: ArrayBuffer }
  | { type: 'unload'; id: number; group: SatGroupId }
  /** `reuse`: a frame the caller is done with, to be written in place. */
  | { type: 'propagate'; id: number; dateMs: number; reuse?: SatFrame }

export type SatReply =
  | { type: 'loaded'; id: number; group: SatGroupId; count: number; dropped: number; ms: number }
  | { type: 'unloaded'; id: number; group: SatGroupId }
  | {
      type: 'frame'
      id: number
      dateMs: number
      groups: SatField['groups']
      ids: string[]
      names: string[]
      positions: Float32Array
      status: Uint8Array
      /** Time for the pass, ms: the spec's iPhone target is ≤ 300 ms with Starlink on. */
      ms: number
      engine: 'wasm' | 'js'
    }
  | { type: 'error'; id: number; message: string }

export interface SatHandlerDeps {
  runtime: () => Promise<Runtime>
}

export function createSatHandler(deps: SatHandlerDeps) {
  const loaded = new Map<SatGroupId, SatRow[]>()
  let field: SatField = buildSatField([])
  // null: the WASM runtime failed once, so every pass uses the JS path.
  let runtime: Promise<Runtime | null> | null = null

  const rebuild = () => {
    field = buildSatField([...loaded].map(([group, rows]) => ({ group, rows })))
  }
  const wasm = () => {
    runtime ??= deps.runtime().catch(() => null)
    return runtime
  }

  return async function handle(
    req: SatRequest,
  ): Promise<{ reply: SatReply; transfer: Transferable[] }> {
    try {
      if (req.type === 'load') {
        const began = performance.now()
        const { group, rows, dropped } = decodeSatGroup(req.body)
        loaded.set(group, rows)
        rebuild()
        const ms = performance.now() - began
        return {
          reply: { type: 'loaded', id: req.id, group, count: rows.length, dropped, ms },
          transfer: [],
        }
      }
      if (req.type === 'unload') {
        loaded.delete(req.group)
        rebuild()
        return { reply: { type: 'unloaded', id: req.id, group: req.group }, transfer: [] }
      }
      const rt = await wasm()
      const began = performance.now()
      const frame = rt
        ? propagateField(rt, field, req.dateMs, req.reuse)
        : propagateFieldJs(field, req.dateMs, req.reuse)
      const ms = performance.now() - began
      return {
        reply: {
          type: 'frame',
          id: req.id,
          dateMs: req.dateMs,
          groups: field.groups,
          ids: field.ids,
          names: field.names,
          positions: frame.positions,
          status: frame.status,
          ms,
          engine: rt ? 'wasm' : 'js',
        },
        transfer: [frame.positions.buffer, frame.status.buffer],
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { reply: { type: 'error', id: req.id, message }, transfer: [] }
    }
  }
}
