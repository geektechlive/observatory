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

/**
 * What the main thread needs to know about the loaded field, sent once per change
 * (load or unload) rather than with every frame: 19,540 names each second cost the main
 * thread a structured clone it doesn't need.
 */
export interface SatFieldInfo {
  /** Bumped on every change; each frame says which field it was computed for. */
  version: number
  groups: SatField['groups']
  /** NORAD ids and names in field order, for picking, search and the inspector. */
  ids: string[]
  names: string[]
  /** Each object's element epoch, ms (the inspector's "orbit data from"). */
  epochMs: Float64Array
  /** Orbit class and launch order per object, for the satellite browser (#158). */
  orbit: Uint8Array
  launch: Int32Array
  /** 1 where the object's elements are CelesTrak SupGP (#209); absent means all GP. */
  supgp?: Uint8Array | undefined
}

export type SatReply =
  | {
      type: 'loaded'
      id: number
      group: SatGroupId
      count: number
      dropped: number
      ms: number
      field: SatFieldInfo
    }
  | { type: 'unloaded'; id: number; group: SatGroupId; field: SatFieldInfo }
  | {
      type: 'frame'
      id: number
      dateMs: number
      /** The field version these positions belong to (SatFieldInfo.version). */
      version: number
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
  const loaded = new Map<SatGroupId, { rows: SatRow[]; supgp: Uint8Array }>()
  let field: SatField = buildSatField([])
  let version = 0
  // null: the WASM runtime failed once, so every pass uses the JS path.
  let runtime: Promise<Runtime | null> | null = null

  const rebuild = () => {
    field = buildSatField([...loaded].map(([group, g]) => ({ group, ...g })))
    version += 1
  }
  const info = (): SatFieldInfo => ({
    version,
    groups: field.groups,
    ids: field.ids,
    names: field.names,
    epochMs: field.epochMs.slice(),
    orbit: field.orbit.slice(),
    launch: field.launch.slice(),
    supgp: field.supgp.slice(),
  })
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
        const { group, rows, supgp, dropped } = decodeSatGroup(req.body)
        loaded.set(group, { rows, supgp })
        rebuild()
        const ms = performance.now() - began
        return {
          reply: {
            type: 'loaded',
            id: req.id,
            group,
            count: rows.length,
            dropped,
            ms,
            field: info(),
          },
          transfer: [],
        }
      }
      if (req.type === 'unload') {
        loaded.delete(req.group)
        rebuild()
        return {
          reply: { type: 'unloaded', id: req.id, group: req.group, field: info() },
          transfer: [],
        }
      }
      const rt = await wasm()
      // Read after the await: a load handled meanwhile has already changed the field.
      const at = version
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
          version: at,
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
