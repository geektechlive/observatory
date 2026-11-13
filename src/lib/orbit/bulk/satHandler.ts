/**
 * The satellite worker's message handling (#98), kept apart from the worker shim
 * (sats.worker.ts) so it runs in tests. Holds the loaded groups; answers each frame
 * request with one SGP4 pass over all of them.
 */
import { isSatRow, REENTRY_GROUP, type SatFieldGroup, type SatRow } from '../satCatalog'
import {
  buildSatField,
  decodeSatGroup,
  propagateField,
  type SatField,
  type SatFrame,
} from './satField'

export type SatRequest =
  /** The /api/orrery-sats body as fetched, transferred undecoded. */
  | { type: 'load'; id: number; body: ArrayBuffer }
  | { type: 'unload'; id: number; group: SatFieldGroup }
  /** The re-entry objects' rows (#154), checked here; none empties the group. */
  | { type: 'reentry'; id: number; rows: unknown[] }
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
      group: SatFieldGroup
      count: number
      dropped: number
      ms: number
      field: SatFieldInfo
    }
  | { type: 'unloaded'; id: number; group: SatFieldGroup; field: SatFieldInfo }
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
      /** Always JS since #137 dropped the WASM path; kept as `data-sat-engine`. */
      engine: 'js'
    }
  | { type: 'error'; id: number; message: string }

export function createSatHandler() {
  const loaded = new Map<SatFieldGroup, { rows: SatRow[]; supgp: Uint8Array }>()
  let field: SatField = buildSatField([])
  let version = 0

  const rebuild = () => {
    // The re-entry objects come last, and an object a loaded group holds is drawn once,
    // from that group (#154).
    const held = new Set<string>()
    for (const [group, g] of loaded)
      if (group !== REENTRY_GROUP) for (const r of g.rows) held.add(r[1])
    const parts = [...loaded]
      .filter(([group]) => group !== REENTRY_GROUP)
      .map(([group, g]) => ({ group, ...g }))
    const reentry = loaded.get(REENTRY_GROUP)
    if (reentry) {
      const rows = reentry.rows.filter((r) => !held.has(r[1]))
      if (rows.length > 0)
        parts.push({ group: REENTRY_GROUP, rows, supgp: new Uint8Array(rows.length) })
    }
    field = buildSatField(parts)
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
  // The worker answers through a promise, the same shape it had while the WASM runtime
  // loaded asynchronously (#137), so the shim and its callers are unchanged.
  return function handle(req: SatRequest): Promise<{ reply: SatReply; transfer: Transferable[] }> {
    return Promise.resolve(answer(req))
  }

  function answer(req: SatRequest): { reply: SatReply; transfer: Transferable[] } {
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
      if (req.type === 'reentry') {
        const began = performance.now()
        const rows = req.rows.filter(isSatRow)
        if (rows.length > 0) loaded.set(REENTRY_GROUP, { rows, supgp: new Uint8Array(rows.length) })
        else loaded.delete(REENTRY_GROUP)
        rebuild()
        return {
          reply: {
            type: 'loaded',
            id: req.id,
            group: REENTRY_GROUP,
            count: rows.length,
            dropped: req.rows.length - rows.length,
            ms: performance.now() - began,
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
      const at = version
      const began = performance.now()
      const frame = propagateField(field, req.dateMs, req.reuse)
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
          engine: 'js',
        },
        transfer: [frame.positions.buffer, frame.status.buffer],
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { reply: { type: 'error', id: req.id, message }, transfer: [] }
    }
  }
}
